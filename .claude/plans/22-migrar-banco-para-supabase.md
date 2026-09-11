# Trocar o Postgres do Docker pelo Supabase

## Contexto

Pedido do Rodrigo: "conecte meu banco de dados que hoje está no docker ao supabase seguindo a
mesma regra e requisitos" — o projeto já existe no Supabase
(`https://supabase.com/dashboard/project/vffuuqryfyzmpjazbajo`, `vffuuqryfyzmpjazbajo`, região
`us-east-1`, Postgres 17.6.1) e a MCP `supabase` já está autenticada. Correção depois da primeira
versão deste plano: a migração é **completa**, incluindo usuário/conta — não só o catálogo do
vlr.gg.

O que o código e o projeto dizem, e que molda o plano:

1. **"A mesma regra" já está satisfeita pela stack atual: Drizzle + `pg` (node-postgres), uma
   variável `DATABASE_URL` só.** `db/index.ts` usa `drizzle-orm/node-postgres` + `Pool` do pacote
   `pg`; `drizzle.config.ts` lê `process.env.DATABASE_URL`. **Nenhum dos dois arquivos muda** — a
   troca é só o *valor* de `DATABASE_URL`, em qualquer `.env`. Não há motivo para trocar de driver
   (ex. para `postgres-js`, que os quickstarts do Supabase mostram por padrão): o `pg` já resolve.

2. **O Supabase criado está vazio** (`list_tables` → `[]`), então o schema entra do zero por
   `pnpm db:migrate` — sem necessidade de `pg_dump --schema-only` nem de editar as 20 migrations em
   `drizzle/`.

3. **O Docker local tem dado de verdade, em 23 tabelas** (`docker exec vlr-fantasy-db psql -c
   "\dt"`): o catálogo raspado do vlr.gg (597 `player`, 301 `match`, 84 `vlr_event`, 12 `round` —
   `pnpm vlr:*`, rate-limited a 1,1s/request, `docs/SCRAPING.md`) **e** os dados de conta/jogo (1
   `user`, 2 `account`, 1 `session`, 5 `fantasy_team`, etc.). Migração completa: as 23 tabelas
   copiam linha por linha, sem exceção.

4. **Todo PK das 23 tabelas é `uuid().defaultRandom()` ou `text` gerado pela app** (nenhuma
   `serial`/`identity`) — não existe sequência para acertar (`setval`) depois do restore.

5. **`--disable-triggers` no dump/restore elimina o problema de ordem de FK.** Com os triggers de
   FK desligados durante o restore, as 23 tabelas podem ser copiadas de uma vez, num `pg_dump`/
   `pg_restore` só, sem precisar listar tabela por tabela na ordem de dependência
   (`user` → `fantasy_team` → `roster_slot` → ...). Funciona porque quem restaura é o dono das
   tabelas (`postgres`, quem rodou as migrations no Supabase).

6. **Sem CI hoje.** Não há `.github/workflows/`; `pnpm db:migrate` roda à mão, do Mac/WSL do
   Rodrigo. A troca de `DATABASE_URL` é manual em cada lugar que hoje aponta pro Docker: `.env` na
   raiz (app) e `deploy/vlr-cron/.env` (o container de scraping, que roda fora de serverless —
   `deploy/vlr-cron/README.md`).

7. **Não existe deploy em produção configurado ainda** — `README.md` só tem o boilerplate padrão
   do `create-next-app` ("Deploy on Vercel"). Este plano troca o banco de dev; quando a app for
   deployada de verdade, a variável `DATABASE_URL` de lá recebe a mesma connection string do
   Supabase.

8. **Tabelas do `public` ficam expostas pela Data API (PostgREST) do Supabase por padrão,
   independente de a app usar `supabase-js` ou não.** Como a app só fala com o banco via Drizzle
   (nunca via `supabase-js`), a Data API não tem uso aqui e vaza schema (inclusive `account.password`
   — hash, e `session.token`) pra internet sem querer. Desligar é um passo do Supabase, não do
   código — ainda mais importante agora que `user`/`account`/`session` migram de verdade.

## Decisões (confirmadas com o Rodrigo)

| # | Pergunta | Decisão |
|---|----------|---------|
| 1 | O que migra? | **Tudo** — as 23 tabelas, incluindo `user`, `account`, `session`, `fantasy_team`, elenco e histórico. Login e time continuam funcionando como estão hoje, só que servidos pelo Supabase. |
| 2 | O que fazer com o Postgres do Docker? | **Manter como está** — `docker-compose.yml` e o container continuam existindo; só o `DATABASE_URL` muda de alvo. Fica como backup/ambiente offline. |
| 3 | Que connection string usar? | **Session pooler em todo lugar** (`aws-*.pooler.supabase.com:5432`) — IPv4-compatível (WSL, Vercel, qualquer VPS), suporta prepared statements, indicado pelo próprio Supabase para migrations. Uma `DATABASE_URL` só, sem `DIRECT_URL` extra. Documentação: [Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres). |

## Fase 1 — Credenciais (só o Rodrigo faz esta parte)

Preciso da connection string com a senha real — ela não é exposta por MCP, por segurança.

1. Dashboard do projeto → botão **Connect** (topo) → aba **Session pooler**.
2. Copiar a string (formato `postgres://postgres.vffuuqryfyzmpjazbajo:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres` — a região/prefixo `aws-N` exatos vêm do dashboard, não adivinhar).
3. Se não souber a senha do banco (definida na criação do projeto), **Reset database password** em
   Project Settings → Database, e usar a nova.
4. Colar em `DATABASE_URL=` no `.env` da raiz do projeto — **não** apagar o valor antigo do Docker,
   comentar numa linha `# DATABASE_URL antigo (docker local): postgresql://vlr_fantasy:...` logo
   acima, para não perder a referência (fato 3, decisão 2).

Me avisa quando estiver feito — as fases seguintes dependem do `.env` já apontar pro Supabase.

## Fase 2 — Schema no Supabase

```bash
pnpm db:migrate
```

Roda as 20 migrations de `drizzle/*.sql` (via `drizzle-kit migrate`) contra o Supabase, seguido de
`tsx scripts/vlr/regions.ts` (`package.json:9`, já parte do script). Confirmo o resultado com
`mcp__supabase__list_tables` — as 23 tabelas do fato 3 devem aparecer, todas vazias.

## Fase 3 — Copiar todos os dados

Dump completo (todas as 23 tabelas, sem filtro) do container Docker, e restore no Supabase — nessa
ordem, sem se preocupar com dependência de FK (fato 5):

```bash
# Dump só de dados, do container Docker (senha do docker-compose.yml, não a do Supabase)
docker exec vlr-fantasy-db pg_dump -U vlr_fantasy -d vlr_fantasy \
  --data-only --disable-triggers -F custom -f /tmp/vlr_fantasy.dump
docker cp vlr-fantasy-db:/tmp/vlr_fantasy.dump ./vlr_fantasy.dump

# Restore no Supabase, via a mesma DATABASE_URL (Session pooler) que já está no .env
pg_restore --data-only --disable-triggers -d "$DATABASE_URL" ./vlr_fantasy.dump
```

`--disable-triggers` evita que os `$onUpdate` e os triggers de FK do Postgres atrapalhem a ordem de
inserção; funciona porque o restore é feito pelo dono das tabelas (`postgres`, quem rodou a
Fase 2). Removo `vlr_fantasy.dump` do disco local depois de confirmar (Fase 6) — é um dump de dados
reais (inclusive hash de senha e tokens OAuth em `account`), não deve sobrar em lugar nenhum além
do `.gitignore`d.

## Fase 4 — Data API do Supabase (segurança, fato 8)

Dashboard → Project Settings → API → desligar a **Data API** (o projeto não usa `supabase-js`;
tudo passa pelo Drizzle, direto no Postgres). Fecha a única porta pública que o schema teria sem
passar pela app — crítico agora que `user`/`account`/`session` estão no banco de verdade. Confirmo
depois com `mcp__supabase__get_advisors` (categoria `security`) — não deve sobrar alerta de RLS
desligada em tabela nenhuma.

## Fase 5 — `deploy/vlr-cron` e documentação

- **`deploy/vlr-cron/.env`** (se já existir localmente, fora do repo): mesma troca de
  `DATABASE_URL` da Fase 1 — é o container que roda os scripts `pnpm vlr:*` fora de serverless
  (fato 6). Sessão pooler serve aqui também: é container de vida longa, mas numa rede
  provavelmente IPv4-only, e sessão pooler é o modo recomendado nesse caso.
- **`.env.example`**: comentário acima de `DATABASE_URL=` citando que a app agora espera a
  connection string do **Session pooler** do Supabase (não mais um Postgres local), com link pra
  doc oficial — o próximo dev (ou o próprio Rodrigo em outra máquina) não tenta adivinhar.
- **`docker-compose.yml`**: fica como está (decisão 2) — nenhuma mudança.

## Fase 6 — Verificação

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test
```

Depois, de olho no app de verdade:

```bash
pnpm dev
```

- Login com a conta que já existia no Docker continua funcionando (decisão 1: `user`/`account`
  migraram) — se a sessão salva já tiver expirado, é só logar de novo com a mesma senha/OAuth.
- `/home` mostra seu time, saldo e calendário de partidas como estava no Docker.
- `/market` carrega os 597 jogadores.

Contagem cruzada (Docker vs. Supabase) em **todas** as 23 tabelas, via `mcp__supabase__execute_sql`
do lado Supabase e `docker exec vlr-fantasy-db psql -c "select count(*) from <tabela>"` do lado
Docker — os números têm de bater tabela por tabela, prova que o restore não perdeu nem duplicou
linha.

## Riscos e o que fica de fora

- **Senha do banco passa pelo `.env` local, não pelo chat** (Fase 1) — decisão deliberada, pra não
  deixar a senha real do Supabase no histórico da conversa.
- **`vlr_fantasy.dump` é dado sensível de verdade** (hash de senha em `account.password`, tokens
  OAuth, tokens de sessão) — vive só localmente durante a Fase 3 e é apagado depois de verificado;
  nunca é commitado.
- **Este plano não mexe em deploy de produção** (fato 7) — quando a app for hospedada de verdade, a
  mesma connection string do Supabase (Session pooler) entra como `DATABASE_URL` lá; se o tráfego
  em produção crescer a ponto de a Session pooler virar gargalo, a conexão pode ser revisitada para
  Transaction pooler na app (opção descartada agora, ver decisão 3).
- **Docker local e Supabase divergem a partir de agora** (decisão 2): qualquer uso feito num não
  reflete automaticamente no outro. Se o Rodrigo continuar rodando `pnpm dev` contra o Docker às
  vezes, os dados dos dois lados vão descolar com o tempo — aceitável, já que o Docker vira só
  backup/ambiente offline.
