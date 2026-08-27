## Produto

Essa aplicação é um **fantasy game de Valorant**, onde o usuário monta um time com **5 jogadores profissionais** de Valorant. Cada jogador pontua conforme suas estatísticas reais em partida (kills, deaths, assists, ACS, clutches, first bloods, plants/defuses, etc), o que aumenta ou diminui o saldo (moeda virtual) do usuário. Com esse saldo, o usuário compra e vende jogadores no mercado de transferências entre as rodadas.

## Commands

Package manager: **pnpm** (see `pnpm-lock.yaml`).

- `pnpm dev` — start Next.js dev server
- `pnpm build` — production build
- `pnpm start` — run built app
- `pnpm lint` — ESLint (`eslint-config-next`)
- `pnpm exec prettier --write .` — format with Prettier

## Tests

- **SEMPRE** use **React Testing Library** e a skill `react-testing-library` ao escrever testes.
- Foque em testar **componentes** (renderização, interação do usuário, acessibilidade via queries por role/label/text).
- Banco de dados **sempre mockado** nos testes. Nunca suba container/DB real — mocke o client/queries diretamente no teste.
- Mocke o client Drizzle (`db`) diretamente. Não use `pg-mem` nem container.
- **SEMPRE** valide o trabalho feito rodando os testes antes de considerar a tarefa concluída.

## Stack

- Next.js 16 (App Router) + React 19
- TypeScript (strict), Tailwind CSS v4 (`@tailwindcss/postcss`)
- ESLint (`eslint-config-next`) + Prettier
- Zod v4 para schemas/validação
- PostgreSQL (banco de dados)
- Drizzle ORM + drizzle-kit (migrations/schema)

Path alias: `@/*` → `./*` (raiz do projeto).

## Project Conventions (from project rules)

### MCPs

- **SEMPRE** use Context7 MCP para buscas em documentação de bibliotecas/frameworks/SDKs.

### Interfaces / UI

- **SEMPRE** use a skill `frontend-design` ao criar/desenhar interfaces (páginas, telas, componentes visuais novos).
- A identidade visual do produto é **dark mode**, inspirada na estética do Valorant (preto/cinza-chumbo de fundo, detalhes em vermelho `#FF4655`, cards com cantos chanfrados). Nunca fugir dessa identidade ao criar novas telas.

### Componentes

- Prefira componentes do **shadcn/ui**. Antes de criar um novo, verifique via Context7 se já existe um shadcn equivalente; se existir, instale-o.
- Extraia componentes/funções reutilizáveis para evitar duplicação.
- Componentes de jogador (player card, escalação, mercado) devem ser reutilizáveis entre as telas "Meu Time" e "Mercado" — evite duplicar a lógica de exibição de pontuação/preço.

### Formulários

- **SEMPRE** React Hook Form + Zod.
- **SEMPRE** escreva mensagens de erro de validação Zod em **português brasileiro**, de forma amigável e acionável. Exemplos: `"Este campo é obrigatório."`, `"E-mail inválido."`, `"Deve ter pelo menos 8 caracteres."`. Nunca deixe mensagens padrão em inglês do Zod aparecerem para o usuário. Schemas internos/servidor (env, webhooks, UUIDs internos) estão isentos.
- **NUNCA** use APIs de string depreciadas do Zod v4 (`z.string().email()`, `z.string().url()`, `z.string().uuid()`, `z.string().cuid()`, `z.string().ip()`, etc). Use os top-level equivalentes: `z.email()`, `z.url()`, `z.uuid()`, `z.cuid()`, `z.ipv4()`/`z.ipv6()`. Passe a mensagem customizada como argumento: `z.email("E-mail inválido.")`.

### Estilização

- **NUNCA** use cores hard-coded do Tailwind. **SEMPRE** use as variáveis de tema definidas em `app/globals.css`.

### Datas

- **SEMPRE** use **dayjs** para formatar e manipular datas em qualquer parte da aplicação (ex: contagem regressiva de abertura/fechamento do mercado, data das partidas/rodadas). Nunca use `Date` nativo, `toLocaleDateString`, `toISOString` ou similares para apresentação de datas ao usuário.

### Pontuação e Mercado

- Regras de cálculo de pontuação (stats → pontos) devem viver em uma camada de domínio isolada (ex: `lib/scoring/`), nunca espalhadas em componentes ou Server Actions.
- Toda alteração de saldo do usuário (compra/venda de jogador, pontuação de rodada) deve ser feita via transação no banco (Drizzle `db.transaction`), nunca em updates soltos, para evitar inconsistência de saldo.

### Banco de Dados

- **SEMPRE** use **Drizzle ORM** para queries e schema. Nunca SQL cru exceto em migrations geradas.
- Schemas em `db/schema/` (um arquivo por tabela/domínio: ex. `players.ts`, `teams.ts`, `rounds.ts`, `transfers.ts`), client em `db/index.ts`.
- Migrations via `drizzle-kit generate` + `drizzle-kit migrate`. Nunca edite SQL gerado à mão.
- Tipos inferidos via `$inferSelect` / `$inferInsert` — nunca redeclare manualmente.
- Use Context7 (`/drizzle-team/drizzle-orm`) antes de escrever query não-trivial.

### Server Actions

- **SEMPRE** crie Server Actions com `next-safe-action`.

### TypeScript

- **NUNCA** use any.

### Planejamento

- **SEMPRE** salve os planos aprovados em `.claude/plans/` no repositório (não só no diretório global de memória).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
