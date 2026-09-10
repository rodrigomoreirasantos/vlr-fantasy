# Cron do pipeline do vlr.gg

Roda os onze scripts `pnpm vlr:*` (`docs/SCRAPING.md`) no ritmo da tabela de
lá, fora do serverless. Existe porque nenhum dos dois pilares do pipeline
sobrevive numa função serverless:

- **o disco importa.** `VLR_STORAGE_DIR` (`lib/vlr/http/raw-store.ts`) guarda
  o HTML bruto de cada partida — "o dado é o HTML, tudo depois é
  recomputável" (`docs/SCRAPING.md`). Um disco efêmero apaga isso a cada
  execução, e `pnpm vlr:reprocess` para de servir para algo;
- **o tempo importa.** `vlr:work` processa até 10 partidas por execução, a
  ~1,1s de rate limit cada — ≥11s, acima do teto de 10s de uma função
  Hobby da Vercel (e do timeout curto comum a outros serverless).

## Subir com Docker

```bash
cd deploy/vlr-cron
cp ../../.env.example .env   # preencha DATABASE_URL e VLR_CONTACT_EMAIL
docker compose up -d --build
```

Variáveis obrigatórias no `.env` (mesmas de `.env.example`, na raiz do
repo): `DATABASE_URL` e `VLR_CONTACT_EMAIL`. As demais (`VLR_BASE_URL`,
`VLR_RATE_LIMIT_MS`, …) têm default e só precisam ser tocadas para mudar o
comportamento padrão.

`docker compose logs -f vlr-cron` mostra a saída de toda execução — o
`entrypoint.sh` encaminha o log do cron para o stdout do container. O HTML
bruto fica no volume nomeado `vlr-raw-html`, que sobrevive a
`docker compose up` de novo (só `docker compose down -v` o apaga).

Verificar que o container está de fato rodando os scripts:

```bash
# Roda um job manualmente, sem esperar o próximo horário do crontab.
docker compose exec vlr-cron pnpm vlr:doctor

# Prova que o volume preservou o HTML bruto entre execuções.
docker compose exec vlr-cron pnpm vlr:results --force --pages=1
docker compose exec vlr-cron pnpm vlr:reprocess --match=<vlrId>

# O quadro de saúde (Decisão 7, plano 17) — sem rede, uma linha por job.
docker compose exec vlr-cron pnpm vlr:health
```

`docker compose ps` mostra `healthy`/`unhealthy` depois do `start_period` de
10 minutos: o `healthcheck` chama `pnpm vlr:health`, que falha se algum job
está atrasado, nunca rodou, ou terminou em falha — a tolerância de cada um
está em `lib/vlr/jobs/health-policy.ts`. **O compose puro não reinicia
sozinho por causa disso** — `unhealthy` é só um sinal no `docker ps`; quem
quiser reinício automático precisa de um vigia externo (Portainer, um
`healthcheck`+`restart` de orquestrador, etc.), que este projeto não entrega.

## Sem Docker (crontab do sistema / VPS)

O arquivo `crontab` deste diretório é um crontab de sistema pronto
(`min hora dia mês dia-da-semana usuário comando`), com `flock -n` em cada
linha para nenhum job se sobrepor à própria execução seguinte. Para instalar:

```bash
sudo cp deploy/vlr-cron/crontab /etc/cron.d/vlr-cron
sudo sed -i "s|cd /app|cd $(pwd)|" /etc/cron.d/vlr-cron
sudo chmod 0644 /etc/cron.d/vlr-cron
```

As variáveis do pipeline continuam vindo de `.env` na raiz do projeto —
`dotenv/config` (já o primeiro import de cada `scripts/vlr/*.ts`) lê esse
arquivo sozinho, então nenhuma linha do crontab precisa exportar variável
nenhuma. Garanta só que o `.env` existe e está preenchido antes da primeira
execução agendada.

## O que cada linha faz

Ver a tabela completa em `docs/SCRAPING.md` — o `crontab` deste diretório é
a mesma tabela, já em cron.
