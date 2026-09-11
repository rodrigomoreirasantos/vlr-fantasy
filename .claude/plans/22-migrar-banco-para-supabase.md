# Trocar o Postgres do Docker pelo Supabase

## Contexto

Pedido do Rodrigo: "conecte meu banco de dados que hoje está no docker ao supabase seguindo a
mesma regra e requisitos" — o projeto já existe no Supabase
(`https://supabase.com/dashboard/project/vffuuqryfyzmpjazbajo`, `vffuuqryfyzmpjazbajo`, região
`us-east-1`, Postgres 17.6) e a MCP `supabase` já está autenticada. A migração é **completa**,
incluindo usuário/conta — não só o catálogo do vlr.gg.

> **Revisão desta versão do plano:** a versão anterior tinha três passos que **falhariam na
> execução** (`pg_restore --disable-triggers` sem permissão no Supabase, `pg_restore` que não existe
> na máquina, e dump abrangendo o schema `drizzle`) e omitia TLS e as permissões padrão de `anon`/
> `authenticated`. Cada correção abaixo foi verificada contra o Supabase e contra o container reais
> — os fatos marcados **(verificado)** têm a saída do comando por trás.

O que o código e o projeto dizem, e que molda o plano:

1. **"A mesma regra" já está satisfeita pela stack atual: Drizzle + `pg` (node-postgres), uma
   variável `DATABASE_URL` só.** `db/index.ts` usa `drizzle-orm/node-postgres` + `Pool` do pacote
   `pg`; `drizzle.config.ts` lê `process.env.DATABASE_URL`. **Nenhum dos dois arquivos muda** — a
   troca é só o *valor* de `DATABASE_URL`. Não há motivo para trocar de driver (ex. para
   `postgres-js`, que os quickstarts do Supabase mostram por padrão): o `pg` já resolve.

2. **O Supabase está vazio** (verificado: `list_tables` em `public` e `drizzle` → `[]`), então o
   schema entra do zero por `pnpm db:migrate` — sem `pg_dump --schema-only` e sem editar as 20
   migrations em `drizzle/`.

3. **O Docker local tem 23 tabelas com 7.563 linhas** (verificado, contagem exata na Fase 6): o
   catálogo raspado do vlr.gg (597 `player`, 6.010 `player_match_stat`, 301 `match`, 106
   `vlr_team`, 84 `vlr_event`, 12 `round` — `pnpm vlr:*`, rate-limited a 1,1s/request,
   `docs/SCRAPING.md`) **e** os dados de conta/jogo (1 `user`, 2 `account`, 1 `session`, 5
   `fantasy_team`, 25 `roster_slot`, 21 `transfer`). Migração completa: as 23 tabelas copiam linha
   por linha, sem exceção.

4. **Nenhuma das 23 tabelas do `public` tem `serial`/`identity`** — todo PK é `uuid().defaultRandom()`
   ou `text` gerado pela app, então não existe sequência para acertar com `setval` depois do
   restore. **Mas existe uma sequência fora do `public`:** `drizzle.__drizzle_migrations.id` é
   `serial` (verificado em `information_schema.columns`). Essa tabela é preenchida pelo
   `drizzle-kit migrate` na Fase 2, no lado do Supabase — se o dump a trouxesse do Docker, o
   resultado seria histórico de migration duplicado e sequência atrasada. **Daí o `-n public` no
   `pg_dump`** (Fase 3): o schema `drizzle` fica fora do dump, de propósito.

5. **`--disable-triggers` NÃO funciona no Supabase** — este é o erro que derrubaria a versão
   anterior deste plano. `pg_restore --disable-triggers` emite `ALTER TABLE ... DISABLE TRIGGER ALL`,
   e isso exige *superusuário* porque os triggers de FK são triggers de sistema. No Supabase o papel
   `postgres` **não é superusuário** (verificado: `pg_roles.rolsuper = false`; só `supabase_admin`
   é, e ele não é acessível). Verificado no projeto real, criando um par de tabelas com FK:

   ```
   ALTER TABLE ... DISABLE TRIGGER ALL  → ERRO: permission denied:
                                          "RI_ConstraintTrigger_c_17502" is a system trigger
   ALTER TABLE ... DISABLE TRIGGER USER → OK (mas inútil: não há trigger de usuário nenhum)
   ```

   **O caminho que funciona é `SET session_replication_role = replica`** (verificado: o `postgres`
   do Supabase consegue, `current_setting` volta `replica`). É exatamente o que a documentação
   oficial prescreve para importar dados no Supabase —
   [Migrate from Postgres to Supabase](https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres):
   `psql --single-transaction --variable ON_ERROR_STOP=1 --command 'SET session_replication_role = replica' --file data.sql`.
   Em `replica`, o Postgres não dispara trigger de usuário **nem** trigger de FK, o que resolve a
   ordem de dependência (`user` → `fantasy_team` → `roster_slot` → …) sem listar tabela por tabela.

6. **Não há `psql`, `pg_dump` nem `pg_restore` na máquina** (verificado: `command not found` no WSL).
   A versão anterior rodava `pg_restore` no host — falharia na primeira linha. **O container
   `vlr-fantasy-db` já tem tudo:** `pg_dump`/`psql` 17.11 (verificado), e alcança o Supabase de
   dentro (verificado: DNS resolve `aws-0`/`aws-1-us-east-1.pooler.supabase.com` e `nc -z ... 5432`
   responde OK). Logo, **dump e restore acontecem os dois dentro do container** — nada de cliente
   Postgres novo para instalar, e nada de incompatibilidade de versão entre cliente antigo e dump
   v17.

7. **TLS precisa ser explícito na `DATABASE_URL`, ou a app conecta em texto puro — ou nem conecta.**
   O certificado do pooler é assinado pela CA própria do Supabase (verificado via `openssl
   s_client -starttls postgres`: `issuer=... CN = Supabase Intermediate 2021 CA`, `Verify return
   code: 19 (self-signed certificate in certificate chain)`), que não está no trust store do
   sistema. Com o `pg` 8.23 / `pg-connection-string` 2.14 deste repo (verificado rodando o parser):

   | Sufixo na `DATABASE_URL` | `ssl` que o `pg` monta | Resultado |
   |---|---|---|
   | *(nenhum)* | `undefined` | conecta **sem TLS** — senha e dados em texto puro na internet |
   | `?sslmode=require` | `{}` (= `verify-full`) | **quebra**: `SELF_SIGNED_CERT_IN_CHAIN` |
   | `?sslmode=no-verify` | `{ rejectUnauthorized: false }` | **conecta cifrado**, sem validar CA ✅ |
   | `?sslmode=verify-full&sslrootcert=<arquivo>` | `{ ca: … }` | cifrado **e** validado ✅ (exige o `.crt` em disco) |

   Este plano usa **`?sslmode=no-verify`** — uma variável, nada em disco, funciona igual na app, no
   `drizzle-kit` e no container do cron. O `sslrootcert` (CA do dashboard → *Connect* → *Download
   certificate*) fica anotado como o passo a mais para quando houver produção de verdade. O `psql`
   de dentro do container não precisa de nada: o default dele é `sslmode=prefer`, que negocia TLS
   sem validar CA.

8. **Tudo que o Drizzle criar no `public` nasce com `GRANT ALL` para `anon`, `authenticated` e
   `service_role`** (verificado em `pg_default_acl`: `{postgres=arwdDxtm/postgres,
   anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}` para
   tabelas do `public`). Isso é o default do Supabase, e é a porta por onde `account.password`
   (hash), `account.accessToken`/`refreshToken` e `session.token` ficariam alcançáveis pela Data API
   (PostgREST) com a chave publishable — que é pública por definição. Desligar a Data API (Fase 4)
   fecha o servidor HTTP, mas **não remove os grants**: qualquer religamento futuro, ou um vazamento
   da `service_role` key, reabre tudo. Por isso a Fase 0 revoga o *default privilege* **antes** das
   migrations — `ALTER DEFAULT PRIVILEGES` só vale para objeto criado depois dele, então a ordem
   importa. A app não é afetada: o Drizzle conecta como `postgres`, dono das tabelas.

9. **Nenhuma migration cria extensão, função ou trigger** (verificado: `grep -iE "create
   (extension|trigger|function|schema)"` em `drizzle/*.sql` → nada). Ou seja, não há nada no banco
   que exija superusuário para rodar, e não existe trigger de usuário nenhum — os `$onUpdate` do
   schema são **código Drizzle em JS** (`.$onUpdate(() => new Date())` em `db/schema/*.ts`), não
   trigger de Postgres. A versão anterior do plano dizia que `--disable-triggers` servia para "os
   `$onUpdate`"; não é o caso, quem atrapalharia são só os triggers de FK (fato 5).

10. **Sem CI hoje.** Não há `.github/workflows/`; `pnpm db:migrate` roda à mão, do WSL do Rodrigo.
    A troca de `DATABASE_URL` é manual em cada lugar que hoje aponta pro Docker: `.env` na raiz
    (app) e `deploy/vlr-cron/.env` (o container de scraping, que roda fora de serverless —
    `deploy/vlr-cron/README.md`).

11. **Só existe `.env` na raiz — não existe `.env.local`** (verificado), e é bom que continue assim:
    o `next dev` dá **precedência ao `.env.local`** sobre o `.env`, enquanto `drizzle.config.ts` e
    todo `scripts/vlr/*.ts` usam `dotenv/config`, que lê **só o `.env`**. Criar um `.env.local`
    depois desta migração é a receita para a app ir pro Docker e as migrations irem pro Supabase sem
    ninguém perceber.

12. **`pnpm db:migrate` roda `drizzle-kit migrate && tsx scripts/vlr/regions.ts`**
    (`package.json:9`). Num banco vazio, `regions.ts` é inofensivo: `syncPlayerRegions` só faz
    `.update(player)` (verificado), zero linha afetada — não insere nada que depois colidiria com o
    restore da Fase 3.

13. **`.gitignore` não cobre `*.dump` nem `*.sql`** (verificado; e `drizzle/*.sql` é versionado de
    propósito). A versão anterior copiava o dump para a raiz do repo dizendo que estava
    "`.gitignore`d" — não estaria: apareceria no `git status` como arquivo novo, a um `git add .` de
    distância de commitar hash de senha e token OAuth. **Este plano nunca traz o dump para o repo:**
    ele nasce e morre em `/tmp` dentro do container (Fase 3).

14. **Não existe deploy em produção configurado ainda** — `README.md` só tem o boilerplate do
    `create-next-app`. Este plano troca o banco de dev; quando a app for deployada, a `DATABASE_URL`
    de lá recebe a mesma connection string.

## Decisões (confirmadas com o Rodrigo)

| # | Pergunta | Decisão |
|---|----------|---------|
| 1 | O que migra? | **Tudo** — as 23 tabelas, incluindo `user`, `account`, `session`, `fantasy_team`, elenco e histórico. Login e time continuam funcionando como estão hoje, só que servidos pelo Supabase. |
| 2 | O que fazer com o Postgres do Docker? | **Manter como está** — `docker-compose.yml` e o container continuam existindo; só o `DATABASE_URL` muda de alvo. Fica como backup/ambiente offline (e como rollback de um passo, ver "Rollback"). |
| 3 | Que connection string usar? | **Session pooler em todo lugar** (`aws-N-us-east-1.pooler.supabase.com:5432`) — IPv4-compatível (WSL, Vercel, qualquer VPS), suporta prepared statements, indicado pelo próprio Supabase para migrations. Uma `DATABASE_URL` só, sem `DIRECT_URL` extra. O host direto (`db.<ref>.supabase.co`) **não resolve daqui** (verificado: é IPv6-only sem o add-on de IPv4), então não é alternativa. Documentação: [Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres). |
| 4 | Modo TLS? | **`?sslmode=no-verify`** no fim da `DATABASE_URL` (fato 7) — cifrado, sem arquivo de CA para distribuir. `sslmode=require` quebraria a app. |

## Fase 0 — Fechar os grants padrão do Supabase (antes de qualquer tabela existir)

Roda **antes** da Fase 2, senão não pega as 23 tabelas (fato 8). Via MCP
(`mcp__supabase__apply_migration`) ou pelo SQL Editor do dashboard:

```sql
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public;
```

É o bloco recomendado pela própria Supabase em
[Securing your API](https://supabase.com/docs/guides/api/securing-your-api) ("Default privileges for
new tables and functions") — a plataforma está migrando esse comportamento para opt-in, e este
projeto não tem motivo nenhum para esperar. Confirmo com `pg_default_acl` depois: as linhas de
`schema = public`, `owner = postgres` não devem mais listar `anon`/`authenticated`/`service_role`.

## Fase 1 — Credenciais (só o Rodrigo faz esta parte)

Preciso da connection string com a senha real — ela não é exposta por MCP, por segurança.

1. Dashboard do projeto → botão **Connect** (topo) → aba **Session pooler**.
2. Copiar a string, formato
   `postgres://postgres.vffuuqryfyzmpjazbajo:[YOUR-PASSWORD]@aws-N-us-east-1.pooler.supabase.com:5432/postgres`
   — o prefixo `aws-N` exato vem do dashboard, **não adivinhar** (os dois, `aws-0` e `aws-1`,
   existem em `us-east-1`; só um é deste projeto).
3. Se não souber a senha do banco (definida na criação do projeto), **Reset database password** em
   Project Settings → Database, e usar a nova.
4. **Se a senha tiver `@`, `:`, `/`, `?`, `#`, `%` ou `&`**, ela precisa entrar
   *percent-encoded* na URL (`@` → `%40`, `#` → `%23`, …), ou o parser corta a string no meio e o
   erro que aparece é um "host não encontrado" sem relação aparente. Ao resetar a senha, a saída
   mais simples é pedir uma só com letras e números.
5. **Acrescentar `?sslmode=no-verify` no fim** (fato 7), ficando:
   `postgres://postgres.vffuuqryfyzmpjazbajo:SENHA@aws-N-us-east-1.pooler.supabase.com:5432/postgres?sslmode=no-verify`
6. Colar em `DATABASE_URL=` no **`.env` da raiz** — **não** apagar o valor antigo do Docker:
   comentar numa linha `# DATABASE_URL antigo (docker local): postgresql://vlr_fantasy:...` logo
   acima, que é o rollback de um passo (decisão 2).
7. **Não criar `.env.local`** (fato 11) — a app e o `drizzle-kit` leriam arquivos diferentes.

Me avisa quando estiver feito — as fases seguintes dependem do `.env` já apontar pro Supabase.

## Fase 2 — Schema no Supabase

```bash
pnpm db:migrate
```

Roda as 20 migrations de `drizzle/*.sql` (via `drizzle-kit migrate`), seguido de
`tsx scripts/vlr/regions.ts` — que num banco vazio não faz nada (fato 12). Confirmo o resultado com
`mcp__supabase__list_tables`: as 23 tabelas do fato 3 devem aparecer, todas vazias, e
`mcp__supabase__list_migrations` deve listar as 20.

Se `drizzle-kit` reclamar de certificado aqui, é sinal de que o `?sslmode=no-verify` não entrou na
string (fato 7) — não é problema do Supabase.

## Fase 3 — Copiar todos os dados

Dump e restore **os dois dentro do container** (fato 6), com o dump escopado ao schema `public`
(fato 4) e os triggers de FK neutralizados por `session_replication_role` (fato 5). Nada toca o
disco do host nem a árvore do repo (fato 13).

```bash
# 1. Carrega a DATABASE_URL do .env no shell sem digitar a senha (não vai pro histórico do zsh).
set -a && . ./.env && set +a
echo "${DATABASE_URL%%:*}"   # confere só o prefixo, sem vazar a senha na tela

# 2. Prova de conectividade antes de gastar um dump: erro de rede aqui é barato.
docker exec -e SB_URL="$DATABASE_URL" vlr-fantasy-db \
  psql "$SB_URL" -At -c "select 'conectado em ' || current_database() || ' como ' || current_user"

# 3. Dump só de dados, só do schema public, do Postgres do Docker
#    (senha do docker-compose.yml; o socket local do container é `trust`).
docker exec vlr-fantasy-db pg_dump -U vlr_fantasy -d vlr_fantasy \
  --data-only -n public --no-owner --no-privileges -f /tmp/vlr-data.sql

# 4. Restore no Supabase — uma transação só, aborta em qualquer erro,
#    com os triggers (inclusive os de FK) desligados pelo session_replication_role.
docker exec -e SB_URL="$DATABASE_URL" vlr-fantasy-db \
  psql \
    --single-transaction \
    --variable ON_ERROR_STOP=1 \
    --command 'SET session_replication_role = replica' \
    --file /tmp/vlr-data.sql \
    --dbname "$SB_URL"

# 5. Apaga o dump de dentro do container (é dado sensível de verdade).
docker exec vlr-fantasy-db rm -f /tmp/vlr-data.sql
```

Por que cada flag:

- **`-n public`** — deixa `drizzle.__drizzle_migrations` fora. Sem isso, histórico de migration
  duplicado e a sequência `serial` atrasada, quebrando a *próxima* `db:generate`/`migrate` (fato 4).
- **`--command 'SET session_replication_role = replica'`** — o único jeito que o papel `postgres`
  do Supabase tem de silenciar os triggers de FK; `--disable-triggers` dá `permission denied`
  (fato 5).
- **`--single-transaction --variable ON_ERROR_STOP=1`** — tudo ou nada. Se falhar no meio, o
  Supabase volta ao estado de fim da Fase 2 (tabelas vazias) e o comando pode ser repetido
  tal e qual, sem limpeza manual.
- **`--data-only`** — o schema já veio das migrations; o dump só traz linhas (em `COPY`, que é o
  default do formato plain).

**Se precisar recomeçar o restore com o banco já parcialmente cheio** (ex.: alguém rodou `pnpm dev`
contra o Supabase no meio do caminho), esvaziar antes — sem derrubar o schema:

```sql
do $$ declare t text;
begin
  for t in select table_name from information_schema.tables
           where table_schema = 'public' and table_type = 'BASE TABLE'
  loop execute format('truncate table public.%I cascade', t); end loop;
end $$;
```

## Fase 4 — Data API do Supabase (segurança, fato 8)

Com os grants já revogados na Fase 0, aqui se fecha o servidor HTTP em si:

1. Dashboard → **Data API** (`/dashboard/project/_/integrations/data_api/overview`) → desligar
   **Enable Data API**. Com ela desligada, nenhum endpoint REST/GraphQL responde, independente de
   grant ou RLS ([Securing your API](https://supabase.com/docs/guides/api/securing-your-api) →
   "Disable the Data API"). A app não perde nada: tudo passa pelo Drizzle, direto no Postgres, e
   `supabase-js` não é dependência do projeto.
2. **Efeito colateral conhecido e documentado:** o Supabase hoje não desliga o PostgREST junto, e o
   log do projeto passa a repetir `schema "pg_pgrst_no_exposed_schemas" does not exist`. É ruído,
   não falha. O workaround oficial é uma migration de três linhas:

   ```sql
   create schema pgrst_no_exposed_schemas;
   alter role authenticator set pgrst.db_schemas = 'pgrst_no_exposed_schemas';
   notify pgrst;
   ```

   ([troubleshooting oficial](https://supabase.com/docs/guides/troubleshooting/schema-pg_pgrst_no_exposed_schemas-does-not-exist)).
3. Confirmo com `mcp__supabase__get_advisors` (categoria `security`). **Expectativa honesta:** não
   sei de antemão se o lint `rls_disabled_in_public` para de apontar as 23 tabelas com a Data API
   desligada. Se continuar apontando, o fechamento é ligar RLS sem política nenhuma —
   `alter table public.<t> enable row level security;` nas 23 —, o que **não afeta a app**: o
   Drizzle conecta como `postgres`, que tem `rolbypassrls = true` (verificado em `pg_roles`). Ficam
   as três camadas fechadas: sem grant, sem endpoint, sem linha visível.

Se a MCP `supabase` parar de responder depois de desligar a Data API (ela usa a Management API, não
o PostgREST, mas vale o plano B), a verificação da Fase 6 sai pelo `psql` do container, com a mesma
query.

## Fase 5 — `deploy/vlr-cron` e documentação

- **`deploy/vlr-cron/.env`** (existe só localmente, fora do repo): mesma `DATABASE_URL` da Fase 1,
  `?sslmode=no-verify` incluído — é o container que roda os `pnpm vlr:*` fora de serverless
  (fato 10). Session pooler serve bem aqui: container de vida longa, rede provavelmente IPv4-only.
  Depois de trocar, `docker compose up -d --force-recreate` a partir de `deploy/vlr-cron/` (o
  `entrypoint.sh` despeja o ambiente num `.env` na subida — variável nova só chega recriando o
  container, não com `restart`), e `docker compose exec vlr-cron pnpm vlr:doctor` para provar que ele
  fala com o Supabase.
- **`.env.example`**: comentário acima de `DATABASE_URL=` dizendo que a app espera a connection
  string do **Session pooler** do Supabase (não mais um Postgres local), **com `?sslmode=no-verify`
  no fim e por quê** (CA própria do Supabase), e o link da doc oficial. Sem isso, o próximo a
  preencher esse arquivo cai no `SELF_SIGNED_CERT_IN_CHAIN` sem pista de onde veio.
- **`deploy/vlr-cron/README.md`**: a linha `cp ../../.env.example .env   # preencha DATABASE_URL e
  VLR_CONTACT_EMAIL` continua correta, mas ganha a nota de que a `DATABASE_URL` agora é a do
  Supabase.
- **`docker-compose.yml`** da raiz: fica como está (decisão 2) — nenhuma mudança.

Nenhum arquivo de código muda em nenhuma fase. O diff desta migração é: `.env.example`,
`deploy/vlr-cron/README.md` e este plano.

## Fase 6 — Verificação

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test
```

Passa por construção (nada de código mudou) — serve de guarda contra alguém ter mexido em
`db/index.ts` "de passagem". Vale lembrar que os testes **não provam nada sobre o Supabase**: o
banco é sempre mockado (CLAUDE.md). Quem prova é o app rodando e a contagem abaixo.

**Contagem cruzada, uma query só, idêntica nos dois lados** — exata (não estimativa de
`pg_stat_user_tables`), 23 linhas, fácil de comparar lado a lado:

```sql
select table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from public.%I', table_name),
                           false, true, '')))[1]::text::bigint as linhas
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;
```

Lado Docker: `docker exec vlr-fantasy-db psql -U vlr_fantasy -d vlr_fantasy -At -F'|' -c "<query>"`.
Lado Supabase: `mcp__supabase__execute_sql` (ou o mesmo `psql` do container apontando pra
`$DATABASE_URL`). Números medidos no Docker **antes** da migração, que é o que tem de aparecer do
lado do Supabase:

| tabela | linhas | | tabela | linhas |
|---|---:|---|---|---:|
| `account` | 2 | | `round` | 12 |
| `championship` | 0 | | `round_player_score` | 48 |
| `championship_member` | 0 | | `round_roster` | 0 |
| `fantasy_identity` | 1 | | `round_team_result` | 0 |
| `fantasy_team` | 5 | | `session` | 1 |
| `friendship` | 0 | | `transfer` | 21 |
| `match` | 301 | | `user` | 1 |
| `player` | 597 | | `verification` | 0 |
| `player_match_stat` | 6010 | | `vlr_event` | 84 |
| `roster_slot` | 25 | | `vlr_job_health` | 5 |
| | | | `vlr_job_run` | 343 |
| | | | `vlr_page_state` | 1 |
| | | | `vlr_team` | 106 |

**Total: 7.563 linhas.** Tem de bater tabela por tabela — prova que o restore não perdeu nem
duplicou linha. (Se o Docker seguir sendo usado entre a medição e a migração, os números sobem;
o que vale é a comparação feita no momento da Fase 6, com esta tabela como sanidade.)

Depois, de olho no app de verdade:

```bash
pnpm dev
```

- Login com a conta que já existia no Docker continua funcionando (decisão 1: `user`/`account`
  migraram) — se a sessão salva já tiver expirado, é só logar de novo com a mesma senha/OAuth.
- `/home` mostra time, saldo e calendário de partidas como estava no Docker.
- `/market` carrega os 597 jogadores.
- Um **write** de verdade (comprar ou vender um jogador) — é o que exercita
  `db.transaction` através do pooler, que nenhuma leitura testa.

## Rollback

Um passo, e sem perda: o Docker fica intacto (decisão 2). Descomentar a linha
`# DATABASE_URL antigo (docker local): …` no `.env`, comentar a do Supabase, reiniciar o `pnpm dev`.
O que tiver sido escrito no Supabase depois da migração não volta para o Docker — daí o "de olho"
da Fase 6 acontecer antes de usar o app pra valer.

## Riscos e o que fica de fora

- **Senha do banco passa pelo `.env` local, não pelo chat** (Fase 1) — decisão deliberada, para não
  deixar a senha real no histórico da conversa. Na Fase 3 ela chega ao `docker exec` via
  `$DATABASE_URL` (`set -a && . ./.env`), nunca digitada — não entra no `~/.zsh_history` nem
  aparece num `docker inspect` do container do banco.
- **`/tmp/vlr-data.sql` é dado sensível de verdade** (hash de senha em `account.password`, tokens
  OAuth, tokens de sessão) — vive só dentro do container, entre os passos 3 e 5 da Fase 3, e é
  apagado no mesmo bloco. Nunca chega ao repo (fato 13).
- **`sslmode=no-verify` cifra, mas não autentica o servidor.** Protege contra bisbilhoteiro na rede;
  não contra um MITM que consiga se passar pelo host do pooler. Para o banco de dev é a troca certa
  (zero arquivo para distribuir); quando houver produção, o upgrade é baixar a CA do dashboard
  (*Connect* → *Download certificate*) e usar
  `?sslmode=verify-full&sslrootcert=/caminho/prod-ca-2021.crt` (fato 7) — muda só o valor da
  variável, nenhum código.
- **Limite de conexões do pooler.** `db/index.ts` cria o `Pool` sem `max`, então são até 10 conexões
  por processo Node — e o `next dev` recarrega, o container do cron conecta, o `drizzle-kit studio`
  conecta. No plano Free o Session pooler é apertado; se aparecer `MaxClientsInSessionMode` ou
  timeout de conexão, a correção é um `max: 5` no `Pool` (e não trocar de pooler às pressas). Não
  mexo nisso agora — só fica nomeado para não ser diagnosticado do zero.
- **Este plano não mexe em deploy de produção** (fato 14) — quando a app for hospedada, a mesma
  connection string entra como `DATABASE_URL` lá. Se o tráfego crescer a ponto de a Session pooler
  virar gargalo, a conexão pode ser revisitada para Transaction pooler **na app** (porta 6543,
  `prepare: false` no driver), mantendo Session pooler para migrations — opção descartada agora
  (decisão 3).
- **Docker local e Supabase divergem a partir de agora** (decisão 2): qualquer uso feito num não
  reflete no outro. Se o Rodrigo continuar rodando `pnpm dev` contra o Docker às vezes, os dados dos
  dois lados descolam — aceitável, já que o Docker vira só backup/ambiente offline. O sintoma
  clássico é "meu time desapareceu": é quase sempre `.env` apontando pro banco errado.
- **Nada de Supabase Auth, Storage, Realtime ou Edge Functions.** A autenticação continua sendo
  `better-auth` nas tabelas `user`/`account`/`session` do `public`; o schema `auth` do Supabase fica
  vazio e sem uso. Trocar de provedor de auth não está neste plano.
