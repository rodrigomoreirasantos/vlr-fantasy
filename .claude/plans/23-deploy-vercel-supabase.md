# Hospedar o app na Vercel, com Supabase de produção separado do de dev

## Contexto

Pedido do Rodrigo: "suba esse projeto na Vercel pois o banco de dados vai ser Supabase", usando as
skills `vercel-composition-patterns` e `vercel-react-best-practices` na migração e na hospedagem. A
migração de banco é o plano 22 (`.claude/plans/22-migrar-banco-para-supabase.md`), aprovado e —
confirmado ao vivo nesta sessão — **já executado por completo**:

1. **As 23 tabelas do `public` existem no Supabase com as contagens exatas do plano 22** (verificado
   via `mcp__supabase__list_tables`): 597 `player`, 6.010 `player_match_stat`, 301 `match`, 106
   `vlr_team`, 84 `vlr_event`, 343 `vlr_job_run`, 12 `round`, 48 `round_player_score`, 25
   `roster_slot`, 21 `transfer`, 5 `fantasy_team`, 5 `vlr_job_health`, 2 `account`, 1 `user`, 1
   `session`, 1 `fantasy_identity`, 1 `vlr_page_state` — nenhuma divergência.
2. **RLS ligado nas 23 tabelas, sem política nenhuma** (verificado via `mcp__supabase__get_advisors`:
   lint `rls_enabled_no_policy`, nível `INFO`, 23 ocorrências) — o estado de fechamento descrito na
   Fase 4 do plano 22. Não afeta a app: o Drizzle conecta como `postgres`, que tem `rolbypassrls`.
3. **O `.env` da raiz aponta para o Supabase** (verificado sem imprimir a senha):
   `aws-0-us-east-1.pooler.supabase.com:5432` (Session pooler) + `?sslmode=no-verify`, com a linha do
   Docker comentada logo acima como rollback.

Este plano cobre o que o 22 deixou de fora de propósito (fato 14 de lá: "não mexe em deploy de
produção") — publicar o app na Vercel — **e corrige um efeito colateral que o 22 criou sem nomear:
dev local e produção passariam a escrever no mesmo banco.**

## Fatos verificados

1. **Não existe projeto Vercel para este repo** (verificado: `mcp__vercel__list_projects` no único
   time, `rodrigomoreirasantos-projects` / `team_z6kbIWEBaYbK7CIK1uMk3Qmg`, plano **Hobby** — vazio).
   Como o repo tem remote GitHub (`rodrigomoreirasantos/vlr-fantasy`), o caminho é
   `mcp__vercel__create_git_project` (deploy a cada push), não upload manual de arquivos.
   **Pré-condição:** o GitHub App da Vercel precisa estar autorizado nesse repositório, senão a
   criação falha — é a primeira coisa a conferir na Fase 3.
2. **Session pooler (5432) não serve para o runtime na Vercel; Transaction pooler (6543) serve.**
   Verificado na doc oficial (`mcp__supabase__search_docs` → "Connect to your database"): session mode
   é para clientes persistentes (é o caso do dev local e do container `vlr-cron`); **transaction mode
   é o indicado para serverless/edge**, que abre muitas conexões curtas. A restrição do modo transação
   é não suportar *prepared statements* nomeados — **verificado que não há nenhum `.prepare(` em
   `db/`, `lib/` ou `app/`**, então nada no código colide com isso.
3. **`db/index.ts` não troca de driver nem de arquivo** (mesma razão do fato 1 do plano 22): muda só
   o *valor* da `DATABASE_URL` por ambiente. O único ajuste de código é o teto do pool (fato 4).
4. **O `Pool` do `pg` está sem `max`** (`db/index.ts`), ou seja, até 10 conexões por processo. Em
   serverless isso multiplica por instância. A doc do Supabase recomenda, para serverless,
   **começar em 1** (`connection_limit=1` no exemplo com Prisma) e subir com cuidado — daí o teto
   baixo da Fase 2, e não um número inventado.
5. **`BETTER_AUTH_URL` precisa ser explícita na Vercel.** Verificado no código do better-auth
   (`getBaseURL`, via Context7): a cadeia de resolução é `baseURL` explícito → `BETTER_AUTH_URL` /
   `NEXT_PUBLIC_BETTER_AUTH_URL` / … → cabeçalhos `x-forwarded-*` (só com `trustedProxyHeaders`) →
   origin do request. **`VERCEL_URL` não está na cadeia.** E o valor só existe depois que a Vercel
   atribuir o domínio — daí a ordem das Fases 3 e 4.
6. **Login em Preview Deployment não vai funcionar com `BETTER_AUTH_URL` fixa.** Verificado
   (`getTrustedOrigins`, via Context7): as origens confiáveis são **derivadas do `baseURL`**, então
   uma URL de preview (host diferente a cada deploy) reprova na checagem de origem. Existe a saída
   oficial — `baseURL: { allowedHosts: ["<domínio>", "*.vercel.app"] }`, disponível no better-auth
   1.7 que o projeto já usa (`^1.7.1`) —, mas ela muda como cookie, URL de provedor OAuth e base são
   reconstruídos **por request**: é mudança de auth, merece passo próprio. **Decisão deste plano:
   preview serve para conferir build, não para logar.**
7. **Login social não funciona no primeiro deploy, e some sozinho da tela.** Verificado em
   `lib/auth.ts`: sem `GOOGLE_*`/`TWITCH_*`, `googleConfigured`/`twitchConfigured` ficam `false` e
   `configuredSocialProviders` sai vazio — os botões não são renderizados. Não há nada a codar para
   isso; é o comportamento já existente.
8. **E-mail real também não funciona no primeiro deploy — e falha em silêncio.** Verificado em
   `lib/email/config.ts:39-45`: sem `RESEND_API_KEY` o transporte cai para `"console"` **mesmo em
   produção**; e `lib/email/send.ts` nunca lança. Na prática o link de verificação/reset existe e é
   válido, mas só aparece nos Runtime Logs da Vercel. Como `emailAndPassword.requireEmailVerification`
   é `true` (`lib/auth.ts`), **ninguém de fora consegue concluir um cadastro** até o Resend entrar —
   é a razão da decisão 4 (produção protegida).
9. **O pipeline de scraping fica fora da Vercel, e não chama o app.** O primeiro já estava no plano 22
   (fato 10) e em `deploy/vlr-cron/README.md`: disco (`VLR_STORAGE_DIR`) e tempo (`vlr:work` passa dos
   10s de uma function Hobby) não sobrevivem a serverless. O segundo eu verifiquei agora, porque o
   nome engana: **`pnpm vlr:revalidate` não tem relação com `revalidatePath` do Next** — ele enfileira
   partidas do vlr.gg para releitura tardia (`lib/vlr/jobs/revalidate-matches.ts`). Ou seja, o cron
   nunca faz requisição HTTP ao site, e proteger a produção (decisão 4) não quebra nada dele.
10. **O build não consulta o banco.** Verificado: `app/page.tsx` é estática e não toca dados;
    `app/(app)/home/page.tsx` usa `headers()` (→ dinâmica); não existe `unstable_cache`,
    `export const revalidate` nem `"use cache"` em lugar nenhum — só `revalidatePath` dentro de Server
    Actions. Mesmo assim as env vars entram **antes** do primeiro deploy (Fase 4), porque o custo de
    fazer na ordem certa é zero.
11. **O código já segue a regra `server-cache-react` da skill.** `getHomeSummary` e `getTeamOverview`
    são memoizados por request com `cache()`, e a Home os chama em `Promise.all`
    (`app/(app)/home/page.tsx:31-35`) — não há waterfall a corrigir ali. O que sobra das skills é
    bundle (fato 12).
12. **`recharts` entra no bundle da Home sem precisar.** `components/home/player-form-chart.tsx`
    (`"use client"`) importa `recharts` direto, e quem o importa é
    `components/home/team-performance.tsx:7-9` — também `"use client"`. Nenhum `next/dynamic` no repo.
    Regra `bundle-dynamic-imports`. **Detalhe que importa na hora de implementar:** o import dinâmico
    vai no *pai* (`team-performance.tsx`), nunca dentro do próprio `player-form-chart.tsx`; e esse
    mesmo import traz `seriesColor` do mesmo módulo, que precisa continuar estático (ou mudar de
    arquivo), senão o `recharts` volta pelo caminho do `seriesColor`.
    Não há violação de `bundle-barrel-imports`: o projeto usa o pacote `radix-ui` unificado, que é
    tree-shakeable por design.
13. **A Home se atualiza sozinha, e é isso que dimensiona o custo na Vercel.** `LiveRefresh`
    (`components/layout/live-refresh.tsx`) dá `router.refresh()` a cada **60s** quando há partida ao
    vivo e a cada **5 min** fora disso (`LIVE_REFRESH_MS`/`IDLE_REFRESH_MS`, `lib/market/window.ts:176-177`),
    por aba visível — aba escondida não atualiza. Cada tique = uma invocação de function + uma rodada
    de queries. O que dimensiona invocação e conexão é **abas abertas**, não usuários cadastrados.
14. **Foto de jogador é imagem otimizada pela Vercel.** `components/player/player-photo.tsx` usa
    `next/image` com `width`/`height` numéricos (`fill` é evitado de propósito, ver o comentário do
    arquivo), e são 597 jogadores vindos de `owcdn.net` (`next.config.ts`, `minimumCacheTTL` de 30
    dias). O Next 16 já limita `images.qualities` a `[75]` por padrão (verificado em
    `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md:775`), então a multiplicação
    de transformações sobra só no eixo da largura — quantos valores distintos de `size` os call sites
    usam. Fica como risco a observar no painel, não como número de cota (que muda).
15. **Projeto Free do Supabase pausa com ~7 dias de baixa atividade** e o Free dá **2 projetos**
    (verificado na doc: "Project Pausing" e "About billing on Supabase"). Consequência direta da
    decisão 3: a **produção** se mantém acordada sozinha porque o `vlr-cron` consulta o banco todo
    dia; o **projeto de dev** é o que vai pausar quando o Rodrigo passar uma semana sem mexer — e
    despausar é um botão no painel. Também: com dois projetos, a cota Free está inteira consumida.
16. **Não existe tool MCP da Vercel para escrever variável de ambiente** (verificado na lista de
    tools do servidor). Logo, a Fase 4 é manual, no painel, feita pelo Rodrigo — mesmo espírito da
    Fase 1 do plano 22, em que a senha não passou pelo chat.
17. **`packageManager: "pnpm@10.4.1"`** (`package.json`) — a Vercel resolve isso via Corepack; não
    precisa configurar install command.
18. **`.mcp.json` está fixado em `project_ref=vffuuqryfyzmpjazbajo`** — que, pela decisão 3, passa a
    ser o projeto de **produção**. É o que eu quero para verificar deploy; o projeto de dev fica sem
    MCP (e sem necessidade dela).

## Decisões confirmadas com o Rodrigo

| # | Pergunta | Decisão |
|---|----------|---------|
| 1 | Branch de produção | **`main`, depois do merge da feature atual.** A Vercel só publica produção a partir de `main`. |
| 2 | Domínio | **`*.vercel.app` por agora.** Domínio próprio fica documentado como passo futuro. |
| 3 | Dev e produção no mesmo banco? | **Não — segundo projeto Supabase só para dev.** O projeto atual (`vffuuqryfyzmpjazbajo`), que já tem os dados reais, **é a produção**; o novo nasce vazio e recebe schema + uma cópia do catálogo. Motivo: sem isso, `pnpm dev` escreveria em saldo/transferência reais e uma migration local chegaria direto na produção. |
| 4 | Site público no primeiro deploy? | **Não — Vercel Authentication ligada também em Production**, até Resend e OAuth existirem (fato 8: cadastro de terceiros ficaria travado na verificação). Vira público num clique depois. |
| 5 | Credenciais de produção (Google/Twitch/Resend) | **Ainda não existem.** Documentadas como pendência, não bloqueiam o deploy (fatos 7 e 8). |
| 6 | Pooler por ambiente | **Session (5432)** para dev local, migrations e `vlr-cron`; **Transaction (6543)** para o runtime na Vercel (fato 2). |

## Fase 0 — Segundo projeto Supabase (o de dev)

Decisão 3. O projeto atual **não é tocado** em nenhum passo desta fase.

1. **Rodrigo, no painel:** criar um projeto novo na mesma organização (sugestão de nome:
   `vlr-fantasy-dev`), **região `us-east-1`** (mesma da produção, para o dump da etapa 3 ser rápido) e
   anotar a senha. Pegar a string do **Session pooler** e acrescentar `?sslmode=no-verify` (fato 7 do
   plano 22 — `sslmode=require` quebra com a CA própria do Supabase).
2. **Repontar o `.env` da raiz** para essa string nova, comentando a linha atual (que vira a de
   produção) com um rótulo claro:
   ```
   # DATABASE_URL produção (Supabase prod, Session pooler): postgres://...
   # DATABASE_URL antigo (docker local): postgresql://vlr_fantasy:...
   DATABASE_URL=postgres://...<projeto-dev>...?sslmode=no-verify
   ```
   Continua valendo o fato 11 do plano 22: **não criar `.env.local`** — `drizzle.config.ts` e os
   `scripts/vlr/*` leem só o `.env`, e ter os dois é a receita para migrar um banco achando que é o
   outro.
3. **Schema e dados no dev:**
   ```bash
   pnpm db:migrate     # roda as 20 migrations no projeto de dev (o .env já aponta pra lá)
   ```
   Depois, copiar o catálogo da produção para o dev — mesma técnica da Fase 3 do plano 22, porque
   continua valendo que **a máquina não tem `psql`/`pg_dump`** e o container `vlr-fantasy-db` tem
   (17.11): dump `--data-only -n public` da produção, restore no dev com
   `--single-transaction --variable ON_ERROR_STOP=1 --command 'SET session_replication_role = replica'`,
   arquivo nascendo e morrendo em `/tmp` **dentro do container** (ele carrega hash de senha e token de
   sessão — nunca vem para a árvore do repo).
4. Conferir no dev: as 23 tabelas existem e as contagens batem com o fato 1.

> **Daqui em diante, "qual banco estou mexendo" é o que estiver no `.env` naquele momento.** Ao
> gerar uma migration nova, a ordem é: aplicar no dev (`.env` no dev) → conferir → aplicar na
> produção (`.env` na produção, temporariamente) → só então subir o código que depende dela.

## Fase 1 — Merge da feature em `main` (sem push ainda)

Decisão 1. O `push` fica para a Fase 4, porque é ele que dispara o primeiro deploy — e a essa altura
as env vars já vão existir.

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test
git checkout main
git merge feat/substituicao-jogadores-mercado
```

Se o Rodrigo preferir PR pela UI do GitHub, tanto faz — o que importa é `main` refletir o que vai
para produção antes do push da Fase 4.

## Fase 2 — Prontidão para produção (as duas skills)

1. **`components/home/team-performance.tsx`** — carregar o gráfico sob demanda com `next/dynamic`
   (`ssr: false` é legal aqui porque o arquivo é `"use client"`), mantendo `seriesColor` como import
   estático (fato 12). Efeito: quem abre `/home` não baixa mais o `recharts` antes de precisar dele.
   O card já reserva a altura do gráfico, então não há salto de layout.
2. **`db/index.ts`** — dar um `max` ao `Pool` (fato 4). Começar baixo, com um comentário explicando
   que o número existe por causa do Transaction pooler e apontando para este plano; subir só se
   aparecer contenção, nunca preventivamente.

Fora isso, o código já está do lado certo das skills no que importa para hospedagem (fato 11). Uma
varredura ampla das ~140 regras não entra aqui — se o Rodrigo quiser, é um `/code-review` ou
`/simplify` dedicado, depois do ar.

Fecha com `pnpm exec tsc --noEmit && pnpm lint && pnpm test` e commit em `main`.

## Fase 3 — Criar o projeto na Vercel (sem deployar ainda)

1. Conferir a pré-condição do fato 1 (GitHub App da Vercel autorizado no repo).
2. `mcp__vercel__create_git_project` com:
   - `repo`: `rodrigomoreirasantos/vlr-fantasy`
   - `teamId`: `team_z6kbIWEBaYbK7CIK1uMk3Qmg`
   - `projectName`: `vlr-fantasy`
   - **`deploy: false`** — de propósito: sem env var nenhuma, um deploy agora seria descartado, e
     `BETTER_AUTH_URL` só existe depois que o domínio for atribuído (fato 5).
3. `mcp__vercel__get_project` para ler o **domínio atribuído** — é o valor de `BETTER_AUTH_URL`.
4. `mcp__vercel__update_project_deployment_protection`: ligar **Vercel Authentication também em
   Production** (decisão 4). Conferir o resultado com `get_project_deployment_protection`.
5. Conferir a **região das functions** no painel: tem de ser `iad1` (Washington, us-east-1), colada no
   Supabase (`us-east-1`). Costuma ser o default do Hobby; se estiver outra, trocar — região errada
   é uma ida-e-volta extra em cada query, em cada tique do `LiveRefresh` (fato 13).

## Fase 4 — Variáveis de ambiente (só o Rodrigo) e primeiro deploy

Fato 16: não há tool MCP para isso — é painel, em **Project Settings → Environment Variables**.
Nenhum valor passa pelo chat.

| Variável | Production | Preview | Observação |
|---|---|---|---|
| `DATABASE_URL` | Supabase **produção**, **Transaction pooler (6543)**, `?sslmode=no-verify` | Supabase **dev**, Transaction pooler | Fato 2 e decisão 3. Preview apontando para o dev é o que garante que preview nunca escreva em produção. |
| `BETTER_AUTH_SECRET` | valor próprio de produção (gerar um novo é o mais seguro) | pode repetir o de dev | Secret novo invalida a sessão migrada — é só logar de novo. |
| `BETTER_AUTH_URL` | `https://<domínio da Fase 3>` | — | Fato 5. Sem isso, todo link de e-mail e callback aponta para `localhost`. Em Preview não adianta valor fixo (fato 6). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | fora por enquanto | fora | Decisão 5. Ao criar a credencial de produção, a redirect URI é `<BETTER_AUTH_URL>/api/auth/callback/google`. |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | fora por enquanto | fora | Idem, `/api/auth/callback/twitch`. |
| `RESEND_API_KEY` / `EMAIL_FROM` | fora por enquanto | fora | Decisão 5 + fato 8. Enquanto não entrar, o link de verificação só existe no Runtime Log. |
| `VLR_*` | **não precisa** | não precisa | Fato 9 — o pipeline roda no container, não na Vercel. |

Com as variáveis salvas:

```bash
git push origin main    # este push é o primeiro deploy de produção
```

## Fase 5 — `deploy/vlr-cron` apontando para a produção

O container é quem alimenta o catálogo que a produção serve, então a `DATABASE_URL` dele é a da
**produção** (Session pooler, fato 6 da decisão) — não a de dev. Um segundo cron para o dev está
descartado: seria raspar o vlr.gg em dobro, contra o rate limit e a etiqueta do `docs/SCRAPING.md`;
quando o catálogo de dev envelhecer, a saída é repetir o dump da Fase 0.

```bash
cd deploy/vlr-cron
# editar .env com a DATABASE_URL de produção
docker compose up -d --force-recreate     # `restart` não basta: o entrypoint.sh só relê o ambiente na subida
docker compose exec vlr-cron pnpm vlr:doctor
```

Atualizar também o `.env.example` e `deploy/vlr-cron/README.md` com a distinção dev/produção — hoje
eles falam de uma `DATABASE_URL` só.

## Fase 6 — Verificação

1. `mcp__vercel__get_deployment_build_logs` do deploy de produção — build limpo.
2. `mcp__vercel__get_runtime_errors` + `mcp__vercel__get_runtime_logs` logo ao abrir o site: erro de
   conexão com o Supabase aparece aqui primeiro (string do pooler errada, `sslmode` faltando).
3. Smoke test no domínio publicado (logado na conta Vercel, por causa da decisão 4):
   - Login com a conta já migrada funciona (ela já está verificada — não depende de e-mail).
   - `/home` mostra time, saldo e calendário; o gráfico de forma aparece logo depois do resto (Fase 2).
   - `/my-team`: uma **compra ou venda de verdade** — é o que exercita `db.transaction` através do
     Transaction pooler, que nenhum teste local cobre (banco sempre mockado, CLAUDE.md).
   - Cadastro novo: confirmar que o link de verificação aparece no Runtime Log (fato 8) — é o
     comportamento esperado, não um defeito.
4. Contagem cruzada das 23 tabelas na produção (`mcp__supabase__execute_sql`, mesma query da Fase 6 do
   plano 22) — as diferenças em relação ao fato 1 têm de ser só o que o smoke test escreveu.
5. `mcp__supabase__get_advisors` (security) na produção: continua só o `rls_enabled_no_policy` de
   nível `INFO`, nada novo.

## Rollback

Nenhum passo deste plano é destrutivo, e cada um desfaz sozinho:

- **Deploy ruim:** `mcp__vercel__pause_project` tira o site do ar na hora; o projeto e as env vars
  ficam. Reverter o commit em `main` e dar push republica a versão anterior.
- **Produção do Supabase:** não é tocada por este plano além do que o app escrever. O banco antigo do
  Docker continua existindo (decisão 2 do plano 22) e o `.env` guarda as duas linhas comentadas.
- **Projeto de dev:** descartável por definição — se algo der errado nele, apagar e refazer a Fase 0.

## Riscos e o que fica de fora

- **Sem domínio próprio, sem login social, sem e-mail real** — os três são passos manuais conhecidos
  (decisões 2 e 5), nenhum bloqueia o deploy. Enquanto o Resend não entrar, o site fica protegido
  (decisão 4), o que é justamente o que evita alguém se cadastrar e travar.
- **Login não funciona em Preview Deployment** (fato 6). Preview serve para conferir build e layout.
  O upgrade, quando fizer falta, é `baseURL: { allowedHosts: [...] }` no `lib/auth.ts` — mudança de
  auth, com passo próprio.
- **O projeto de dev vai pausar sozinho** depois de ~7 dias sem uso (fato 15). É esperado; despausar
  é um botão. A produção não pausa enquanto o `vlr-cron` estiver rodando.
- **Image Optimization é o recurso medido que este app mais consome** (fato 14): 597 jogadores ×
  larguras distintas. Se apertar, a mitigação é padronizar os valores de `size` nos call sites ou
  marcar essas fotos como `unoptimized` — elas já vêm pequenas do `owcdn.net`.
- **Invocações crescem com abas abertas, não com usuários** (fato 13). Vale lembrar antes de olhar o
  painel e estranhar o número.
- **`sslmode=no-verify` cifra, mas não autentica o servidor.** O plano 22 deixou o `verify-full` para
  "quando houver produção de verdade" — é agora, e a escolha consciente é adiar: o upgrade é a CA do
  Supabase numa env var + `ssl: { ca }` em `db/index.ts`, sem arquivo no repo. Fica nomeado, não
  esquecido. (A opção *SSL Enforcement* do painel do Supabase é compatível com `no-verify`: ela exige
  TLS, não validação de CA pelo cliente.)
- **Sem CI.** `pnpm test`/`tsc`/`lint` continuam rodando à mão antes do merge (Fase 1). Um workflow do
  GitHub Actions rodando isso em cada PR seria o próximo passo natural — não está neste plano.
- **Scraping continua fora da Vercel** (fato 9), e **nenhuma auditoria ampla das skills foi feita**
  (fato 11): só o que muda a experiência de quem abre o app hospedado.
