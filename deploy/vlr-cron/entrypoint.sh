#!/bin/sh
set -eu

# `cron` roda cada linha com um ambiente praticamente vazio — não herda o do
# container. Os scripts (`pnpm vlr:*`) já esperam suas variáveis vindo de um
# `.env` (todo entrypoint `scripts/vlr/*.ts` importa `dotenv/config` como
# primeiro import), então a ponte mais simples é despejar o ambiente do
# container num `.env` em `/app` — nenhuma linha do crontab precisa saber de
# variável nenhuma, e nada muda em `lib/vlr/config.ts`.
# O `=.+` no fim descarta variável vazia, e isso não é detalhe: o compose
# preenche as opcionais com `${VAR:-}`, e `VLR_USER_AGENT=` (vazio) chegaria
# ao Zod de `lib/vlr/config.ts` como string presente — reprovada por
# `.min(1)`, derrubando o pipeline inteiro por uma variável que era opcional.
#
# `grep` sem nenhuma correspondência sai com 1 e, com `set -e`, mataria o
# container sem dizer por quê — daí a mensagem explícita.
env | grep -E '^(DATABASE_URL|VLR_[A-Z_]+|NODE_ENV)=.+' > /app/.env || {
  echo "vlr-cron: nenhuma variável do pipeline no ambiente. Confira o .env ao lado do docker-compose.yml." >&2
  exit 1
}

touch /var/log/vlr-cron.log

cron -f -l 2 &
cron_pid=$!

# `docker logs` só vê stdout/stderr do processo principal — sem isso, toda
# saída dos scripts ficaria presa no arquivo de log, invisível de fora.
tail -F /var/log/vlr-cron.log &

# Encerra os dois junto com o container (`docker stop`), em vez de deixar o
# `tail` em segundo plano sozinho depois que o cron sai.
trap 'kill "$cron_pid" 2>/dev/null' TERM INT

wait "$cron_pid"
