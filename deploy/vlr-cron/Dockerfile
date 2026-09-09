# Roda o pipeline do vlr.gg (docs/SCRAPING.md) por cron, fora do serverless —
# ver a decisão registrada em `.claude/plans/11-mercado-sempre-atualizado.md`:
# o disco de `VLR_STORAGE_DIR` (lib/vlr/http/raw-store.ts) precisa sobreviver
# entre execuções para `pnpm vlr:reprocess` continuar valendo, e nenhum
# runner efêmero garante isso.
#
# Build a partir da raiz do repo:
#   docker build -f deploy/vlr-cron/Dockerfile -t vlr-cron .
# (o `docker-compose.yml` deste diretório já aponta o contexto certo.)
FROM node:22-slim

# `cron` roda o agendador; `flock` (de `util-linux`, quase sempre já presente
# na imagem base, reinstalado aqui por garantia) serializa cada job consigo
# mesmo — ver o comentário no `crontab`.
RUN apt-get update \
  && apt-get install -y --no-install-recommends cron util-linux ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Camada de dependências separada do resto do código — só reinstala quando o
# lockfile muda.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

COPY deploy/vlr-cron/crontab /etc/cron.d/vlr-cron
RUN chmod 0644 /etc/cron.d/vlr-cron

COPY deploy/vlr-cron/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
