# Login e cadastro — verificação de e-mail obrigatória, recuperação de senha e tela nova

## Context

`prompts/19_login.md` pede quatro coisas: cadastro por e-mail, cadastro por Google **e outras
contas**, verificação de e-mail obrigatória antes do primeiro login, e recuperação de senha "pelo
método mais seguro" — tudo isso com a tela redesenhada dentro da identidade da marca.

O que o código diz e que muda o pedido:

1. **A biblioteca de auth já existe e é o better-auth 1.7.1** (`package.json:21`, `lib/auth.ts:15`),
   com adapter Drizzle (`lib/auth.ts:17`), plugin `username` (`lib/auth.ts:58`), `nextCookies()`
   (`lib/auth.ts:60`) e handler em `app/api/auth/[...all]/route.ts`. **Google já está configurado**
   (`lib/auth.ts:26-33`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` em `.env.example:4-5`). Não se
   troca nem se acrescenta biblioteca de auth: o pedido é configuração + telas.
2. **A verificação de e-mail está desligada**: `requireEmailVerification: false` (`lib/auth.ts:23`) e
   **não existe nenhum `emailVerification` no config**. `user.emailVerified` nasce `false`
   (`db/schema/auth.ts:15`) e nunca foi promovido para ninguém que entrou por e-mail/senha.
3. **Não existe provedor de e-mail transacional em lugar nenhum.** Nada de `resend`/`nodemailer` em
   `package.json`, nenhuma env de SMTP/API key em `.env.example`, nenhuma pasta `lib/email/`. Sem
   isso, verificação e recuperação de senha não saem do papel — esta é a dependência crítica do
   plano inteiro.
4. **A tabela `verification` já existe** (`db/schema/auth.ts:79-92`, índice em `identifier`). É onde
   o better-auth guarda tanto o token de verificação quanto o de reset (`reset-password:<token>`,
   `node_modules/better-auth/dist/api/routes/password.mjs:78`). **Nenhuma tabela nova é necessária.**
5. **Ligar `requireEmailVerification: true` tranca a base atual inteira.** Em
   `.../api/routes/sign-in.mjs:339-351`: e-mail não verificado → `FORBIDDEN EMAIL_NOT_VERIFIED`.
   Como (2) diz, todo mundo que se cadastrou por e-mail está com `email_verified = false`. Precisa de
   uma migration de backfill, senão a feature expulsa quem já joga.
6. **Com `requireEmailVerification: true`, cadastrar com e-mail já existente devolve _sucesso
   sintético_**, não erro (`.../api/routes/sign-up.mjs:163`, `167-198`, `205-211`). Isso quebra duas
   coisas nossas:
   - `signUpWithTeam` (`app/(auth)/signup/actions.ts:43-54`) recebe um `user.id` **falso** e chama
     `updateTeamNameForUser` (`lib/team/queries.ts:542-551`) com ele — `UPDATE` de 0 linhas, sem erro,
     silencioso. Tolerável, mas precisa de comentário: é proteção contra enumeração de e-mail, não bug.
   - `lib/auth-errors.ts:9-10` traduz `USER_ALREADY_EXISTS`, que **deixa de ser emitido** nesse fluxo.
7. **Com `requireEmailVerification: true`, o cadastro não cria sessão**: o endpoint devolve
   `token: null` e pula o `setSessionCookie` (`.../api/routes/sign-up.mjs:262-265`). O
   `router.push("/home")` de `components/auth/sign-up-form.tsx:41` passa a jogar o usuário recém-criado
   em `/home`, que não acha sessão (`app/(app)/layout.tsx:25-28`) e o devolve para `/login`. **O fluxo
   de cadastro atual quebra no dia em que a flag virar `true`** — tem de mudar junto.
8. **O plugin `username` adiciona colunas ao `user`** (`username`, `displayUsername` —
   `db/schema/auth.ts:20-21`), então a resposta sintética de (6) sai com um formato diferente do
   cadastro real e denuncia que o e-mail existe. O better-auth 1.7.1 oferece
   `emailAndPassword.customSyntheticUser` exatamente para isso
   (`.../api/routes/sign-up.mjs:178-191`).
9. **Em 1.7.1 o método de recuperação chama `requestPasswordReset`, e `forgetPassword` não existe**
   (`.../api/routes/password.mjs:21`, `208`). O fluxo é: `POST /request-password-reset {email,
redirectTo}` → e-mail com `${baseURL}/reset-password/<token>?callbackURL=<redirectTo>` → o GET
   valida e redireciona para `redirectTo?token=…` ou `redirectTo?error=INVALID_TOKEN`
   (`password.mjs:81-82`, `125-127`) → `POST /reset-password {token, newPassword}`. O token é de uso
   único (`consumeVerificationValue`, `password.mjs:158`) e a rota já é à prova de enumeração
   (`password.mjs:60-72`: usuário inexistente recebe a mesma resposta genérica).
10. **`accountLinking.requireLocalEmailVerified` é `true` por padrão**
    (`.../oauth2/link-account.mjs:82-88`). Consequência prática desagradável: quem se cadastrar por
    e-mail/senha e **não** verificar, e então clicar em "Continuar com o Google" com o mesmo e-mail,
    **não** tem as contas vinculadas — cai em `account_not_linked`.
11. **Erro de OAuth hoje sai em inglês, numa página que não é nossa.** O callback redireciona para
    `errorCallbackURL` ou, na falta dele, para `${baseURL}/error`
    (`.../api/routes/callback.mjs:36`, `79`). `GoogleButton` (`components/auth/google-button.tsx:13`)
    **não passa `errorCallbackURL`** e não mostra erro nenhum: qualquer falha some da tela.
12. **Quem entra por Google já nasce verificado** (`.../oauth2/link-account.mjs:226`: o usuário é
    criado com `emailVerified: userInfo.emailVerified`) e, ao entrar por Google num e-mail de conta
    já verificada, as contas se vinculam e `emailVerified` é promovido (`link-account.mjs:133`,
    `181`). Ou seja: o "SEMPRE verificar" do prompt só tem custo para o cadastro por e-mail/senha.
13. **Rate limit já vem pronto** e é ligado em produção por padrão (`window: 10`, `max: 100`,
    storage em memória — `.../context/create-context.mjs:169-174`), com regras especiais de
    3 req/10s para `/sign-in*` e `/sign-up*` e 3 req/60s para `/request-password-reset` e
    `/send-verification-email` (`.../api/rate-limiter/index.mjs:302-316`). **Não inventar regra
    própria**: já está coberto.
14. **Não existe nenhuma tela de verificação, de "esqueci a senha" ou de reset.** `app/(auth)/` só
    tem `login/` e `signup/` (mais `layout.tsx`). `lib/auth-errors.ts:18` já tem a mensagem de
    `EMAIL_NOT_VERIFIED` escrita — e ela nunca disparou.
15. **A moldura visual atual é modesta**: um card centralizado de `max-w-sm`
    (`components/auth/auth-card.tsx:30-52`) sobre um flex centralizado
    (`app/(auth)/layout.tsx:5-7`). O vocabulário da marca já existe e deve ser reaproveitado: paleta
    em `app/globals.css:59-115` (`--primary: #ff4655`, `--background: #0b0d0f`) e o utilitário de
    canto chanfrado `clip-corner` (`app/globals.css:129-139`, com `[--clip:Npx]` ajustável).
16. **Já existe um padrão de config de env com Zod** (`lib/vlr/config.ts:14-58`): schema Zod validado
    de forma **preguiçosa** e congelado em cache, com mensagens em inglês porque quem lê é quem opera
    o deploy. O módulo de e-mail deve seguir esse molde à risca.
17. **Um teste passa a mentir**: `components/auth/sign-up-form.test.tsx:124` espera
    `push("/home")` depois do cadastro — o que deixa de ser verdade por causa de (7).

**Resultado esperado:** o jogador abre `/login` e vê uma tela em duas colunas com a marca à esquerda
e o card chanfrado à direita; entra com e-mail/senha, com Google ou com Discord; ao se cadastrar por
e-mail recebe um link de confirmação e só consegue entrar depois de clicar nele; e, se esquecer a
senha, pede um link de redefinição que expira em 15 minutos, vale uma vez só e derruba todas as
sessões antigas ao ser usado.

---

## Suposições (a entrevista rodou sem canal com o usuário — confirmar antes de executar)

Não houve como fazer perguntas nesta sessão (`AskUserQuestion` indisponível em subagente). As
decisões abaixo são as mais defensáveis diante do código, **mas são suposições, não decisões
fechadas**. As quatro primeiras mudam o plano de verdade; se alguma cair, revise a fase indicada.

| #   | Suposição                                                                                                                                                                                                                                                                                                                        | Fase afetada |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | **Provedor de e-mail: Resend pela API HTTP, chamada com `fetch` nativo** — sem instalar dependência. Sem `RESEND_API_KEY` no ambiente (dev), o "envio" imprime assunto, destinatário e link no console. É a opção que não adiciona dep, não depende de SMTP e deixa o fluxo inteiro testável antes de existir conta no provedor. | 0            |
| 2   | **Contas antigas são poupadas**: uma migration custom marca `email_verified = true` para todo usuário criado antes da data de corte. Ninguém é expulso; a obrigatoriedade vale de lá para frente.                                                                                                                                | 1            |
| 3   | **"Outras contas" = Discord**, além do Google. É onde o público de Valorant está e o app OAuth sai em minutos. Fica registrado como um mapa de provedores, então Twitch/GitHub entram depois só somando envs.                                                                                                                    | 2, 4         |
| 4   | **Login sem senha (magic link / código OTP) fica fora**. O escopo é e-mail+senha verificado, OAuth e reset por link. Os plugins existem (`node_modules/better-auth/dist/plugins/magic-link`, `email-otp`) e podem virar um plano próprio.                                                                                        | —            |
| 5   | **Verificação: link clicável, 1 hora de validade** (default do better-auth), com `autoSignInAfterVerification: true` — quem clica no link cai logado em `/home`. O token é de uso único e ligado ao e-mail.                                                                                                                      | 2, 6         |
| 6   | **Reset: 15 minutos de validade (`resetPasswordTokenExpiresIn: 900`), uso único, e `revokeSessionsOnPasswordReset: true`** (derruba todas as sessões). Mais `onPasswordReset` mandando um e-mail de aviso "sua senha foi alterada". É o "método mais seguro" pedido pelo prompt, dentro do que a lib oferece sem plugin extra.   | 2, 7         |
| 7   | **`sendOnSignIn: true`**: tentar entrar sem ter verificado reenvia o link automaticamente, além de mostrar a mensagem. Evita o beco sem saída de "não recebi o e-mail".                                                                                                                                                          | 2, 5         |
| 8   | **O cadastro continua criando o time na hora** (`ensureFantasyTeam` em `lib/auth.ts:43-52`), mesmo antes da verificação. Nome de time e `@login` ficam reservados a partir do cadastro. Alternativa (guardar o cadastro num limbo até verificar) exigiria tabela nova e reescreveria o `databaseHooks` — desproporcional.        | 3            |
| 9   | **O redesenho é da moldura de autenticação inteira** (`/login`, `/signup` e as três telas novas), não só de `/login`: elas compartilham um `AuthShell`. Redesenhar só o login deixaria o cadastro visivelmente órfão.                                                                                                            | 4            |
| 10  | **Rotas novas em inglês** (`/verify-email`, `/check-email`, `/forgot-password`, `/reset-password`), copy em pt-BR — é o padrão do app (`/my-team`, `/ranking`, `/profile`).                                                                                                                                                      | 5, 6, 7      |
| 11  | **`accountLinking` fica no default seguro** (`requireLocalEmailVerified: true`). O caso do fato 10 é tratado com **mensagem**, não afrouxando a política: "Já existe uma conta com este e-mail aguardando confirmação. Confirme o e-mail e tente de novo."                                                                       | 2, 4         |
| 12  | **Sem tela de "trocar e-mail" e sem 2FA.** Fora do escopo.                                                                                                                                                                                                                                                                       | —            |

**Divergência deliberada do pedido:** o prompt diz "o usuário **SEMPRE** precisa autenticar no e-mail
antes de realizar o login". Quem entra por Google/Discord **não** recebe e-mail de confirmação — e
isso é correto, não uma brecha: o provedor já entrega o e-mail verificado e o better-auth o copia
para `user.emailVerified` (fato 12). Mandar um link de confirmação para quem acabou de provar a posse
do e-mail no Google só serve para o usuário desistir no meio. A regra vale integralmente para o
cadastro por e-mail e senha, que é onde ela protege alguma coisa.

---

## Fase 0 — Camada de e-mail (pura + transporte)

Sem banco, sem React: dá para testar tudo antes de tocar em auth.

**Arquivos**

- `lib/email/config.ts` (novo) — molde de `lib/vlr/config.ts:14-58`.
- `lib/email/templates.ts` (novo) — funções **puras**.
- `lib/email/templates.test.ts` (novo).
- `lib/email/send.ts` (novo) — o único ponto que faz rede.
- `.env.example` (muda).

**O que muda**

`lib/email/config.ts` — validação preguiçosa e congelada, mensagens em inglês (o `CLAUDE.md` isenta
env da regra de pt-BR):

```ts
const configSchema = z.object({
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default("VLR Fantasy <onboarding@resend.dev>"),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
});
```

Sem `RESEND_API_KEY`, `getEmailConfig()` devolve `{ transport: "console" }`; com a chave,
`{ transport: "resend", apiKey, from }`. Nada de `any` em lugar nenhum.

`lib/email/templates.ts` — três funções puras, cada uma devolvendo
`{ subject: string; html: string; text: string }`, nenhuma tocando rede ou `Date` direto (datas de
validade formatadas com **dayjs**, conforme o `CLAUDE.md`):

- `verificationEmail({ name, url })` — "Confirme seu e-mail e entre em campo".
- `resetPasswordEmail({ name, url, expiresInMinutes })` — "Redefinir sua senha".
- `passwordChangedEmail({ name })` — aviso pós-reset.
- `existingAccountEmail({ name })` — o e-mail de `onExistingUserSignUp` ("alguém tentou criar uma
  conta com o seu e-mail; se foi você, entre em vez de cadastrar").

O HTML é uma tabela simples inline-styled na paleta da marca (`#0b0d0f` de fundo, `#ff4655` no
botão) — aqui os valores são literais de propósito: **cliente de e-mail não lê variável CSS**, e
esse é o único lugar do projeto onde a cor não vem de `app/globals.css`. Deixe isso escrito num
comentário no topo do arquivo, senão parece violação da regra.

`lib/email/send.ts`:

```ts
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void>;
```

No transporte `console`, imprime `to`, `subject` e o `text` inteiro (o link fica clicável no
terminal). No `resend`, `POST https://api.resend.com/emails` com `Authorization: Bearer`. **Nunca
lança para o chamador**: erro de e-mail vira `console.error` — um provedor fora do ar não pode
derrubar um cadastro que já gravou no banco.

`.env.example` ganha, com comentário:

```
# --- E-mail transacional (lib/email) ---
# Sem RESEND_API_KEY o e-mail é impresso no console (dev). Em produção é obrigatória.
RESEND_API_KEY=
EMAIL_FROM="VLR Fantasy <nao-responda@seudominio.com>"
```

**Testes** (`lib/email/templates.test.ts`, `@vitest-environment node`): o assunto está em pt-BR; a
URL aparece no `html` **e** no `text`; o `text` não contém tag HTML; `resetPasswordEmail` cita "15
minutos"; nenhum template interpola nome vazio como `undefined`.

**Como verificar:** `pnpm test lib/email` e `pnpm exec tsc --noEmit`.

---

## Fase 1 — Migration de backfill do `email_verified`

**Arquivos**

- `drizzle/0017_<nome_gerado>.sql` (novo, **custom**).

**O que muda**

Nenhuma coluna nasce ou morre — o schema de `db/schema/auth.ts` fica **intacto** (fato 4). O que
falta é dado. Gere com `pnpm exec drizzle-kit generate --custom --name=verify_existing_users` e
escreva dentro:

```sql
-- Todo usuário que existia antes da verificação obrigatória entra como
-- verificado: ligar `requireEmailVerification` sem isto trancaria a base
-- inteira para fora (plano 19, fato 5).
UPDATE "user" SET "email_verified" = true WHERE "created_at" < NOW();
```

`NOW()` é avaliado no instante da migration, então a marcação é exatamente "quem já existia".
Cadastro feito depois não é afetado. Nunca edite SQL gerado pelo drizzle-kit à mão — este arquivo é
`--custom`, ou seja, nasce vazio para ser escrito, o que é permitido.

**Testes:** nenhum (migration de dado). A prova é manual.

**Como verificar:** `pnpm db:migrate` e, no `pnpm db:studio`, conferir que os usuários existentes
estão com `email_verified = true`. Criar uma conta nova depois e conferir que ela nasce `false`.

---

## Fase 2 — Configuração do better-auth

O coração da feature. Tudo aqui é `lib/auth.ts`.

**Arquivos**

- `lib/auth.ts` (muda).
- `lib/auth-errors.ts` (muda).
- `lib/auth-client.ts` (muda — só exports).
- `.env.example` (muda — Discord).

**O que muda em `lib/auth.ts`**

1. `emailAndPassword` passa a:

```ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,
  minPasswordLength: 8,
  resetPasswordTokenExpiresIn: 900,      // 15 min
  revokeSessionsOnPasswordReset: true,
  sendResetPassword: async ({ user, url }) => { /* resetPasswordEmail + sendEmail */ },
  onPasswordReset: async ({ user }) => { /* passwordChangedEmail + sendEmail */ },
  onExistingUserSignUp: async ({ user }) => { /* existingAccountEmail + sendEmail */ },
  // O plugin `username` acrescenta colunas ao `user` (db/schema/auth.ts:20-21).
  // Sem isto, a resposta sintética de e-mail duplicado sai com menos campos que
  // um cadastro real e denuncia que a conta existe.
  customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
    ...coreFields,
    username: null,
    displayUsername: null,
    ...additionalFields,
    id, // o id vai por último para bater com a ordem do banco
  }),
},
```

2. Bloco `emailVerification` (novo):

```ts
emailVerification: {
  sendOnSignIn: true,                 // suposição 7
  autoSignInAfterVerification: true,  // suposição 5
  sendVerificationEmail: async ({ user, url }) => { /* verificationEmail + sendEmail */ },
},
```

3. `socialProviders` vira um mapa montado condicionalmente, um provedor por env presente —
   estendendo o padrão que já existe em `lib/auth.ts:11-33`:

```ts
const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);
const discordConfigured = Boolean(
  process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET,
);
```

e exporte **uma lista tipada**, não dois booleanos soltos, porque a UI vai iterar sobre ela:

```ts
export type SocialProviderId = "google" | "discord";
export const configuredSocialProviders: SocialProviderId[] = [
  ...(googleConfigured ? (["google"] as const) : []),
  ...(discordConfigured ? (["discord"] as const) : []),
];
```

Mantenha `isGoogleConfigured` exportado enquanto houver quem importe (`app/(auth)/login/page.tsx:9`,
`app/(auth)/signup/page.tsx:9`) — ou troque os dois usos nesta mesma fase e remova o export.

4. **Não mexer em `account.accountLinking`** (suposição 11) e **não mexer em `rateLimit`** (fato 13).
   Deixe um comentário explicando que o silêncio é intencional nos dois casos; sem ele, o próximo
   leitor "conserta".

5. `databaseHooks.user.create.after` (`lib/auth.ts:34-56`) **fica como está**, com uma linha de
   comentário a mais: o hook roda no cadastro, antes da verificação, então `@login` e time já nascem
   reservados (suposição 8).

**O que muda em `lib/auth-errors.ts`**

Acrescente ao mapa existente (`errorMessages`, linha 8):

- `INVALID_TOKEN`: "Este link é inválido ou já foi usado. Peça um novo."
- `TOKEN_EXPIRED`: "Este link expirou. Peça um novo."
- `EMAIL_ALREADY_VERIFIED`: "Este e-mail já está confirmado. É só entrar."
- `RESET_PASSWORD_DISABLED`: "A recuperação de senha está indisponível. Tente mais tarde."
- Reescreva `EMAIL_NOT_VERIFIED` (linha 18) para refletir `sendOnSignIn: true`: "Confirme seu e-mail
  antes de entrar. Acabamos de enviar um novo link para você."

E acrescente uma **segunda** função, porque os erros de OAuth chegam como query string em minúsculas
com underscore (`.../oauth2/errors.mjs:8-22`) e não pelo `$ERROR_CODES`:

```ts
const oauthErrorMessages: Record<string, string> = {
  account_not_linked:
    "Já existe uma conta com este e-mail aguardando confirmação. Confirme o e-mail e tente de novo.",
  email_not_found:
    "O provedor não devolveu um e-mail. Tente cadastrar com e-mail e senha.",
  email_not_verified:
    "O e-mail dessa conta ainda não foi confirmado no provedor.",
  unable_to_create_user: "Não foi possível criar a conta. Tente novamente.",
  state_not_found: "A sessão de login expirou. Tente novamente.",
  invalid_callback_request:
    "Não foi possível concluir o login. Tente novamente.",
};

export function translateOAuthError(code?: string | null): string;
```

**O que muda em `lib/auth-client.ts`**

Exporte também o que as telas novas precisam, no estilo da linha 8:

```ts
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
} = authClient;
```

Atenção: **é `requestPasswordReset`, não `forgetPassword`** — o alias antigo não existe na 1.7.1
(fato 9). Confirme com `pnpm exec tsc --noEmit` antes de seguir.

**`.env.example`** ganha `DISCORD_CLIENT_ID=` / `DISCORD_CLIENT_SECRET=`, com um comentário dizendo
que o provedor só aparece na tela se as duas existirem.

**Testes:** `lib/auth.ts` não é testado diretamente (constrói o cliente e toca banco). O que é
testável e deve ser testado: `lib/auth-errors.test.ts` (novo) — cada código novo devolve a frase
pt-BR esperada, e código desconhecido cai na mensagem genérica, tanto em `translateAuthError` quanto
em `translateOAuthError`.

**Como verificar:** `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test lib/auth-errors`.

---

## Fase 3 — Cadastro deixa de logar direto

Corrige o que a Fase 2 quebra (fatos 6 e 7), antes de qualquer tela nova.

**Arquivos**

- `app/(auth)/signup/actions.ts` (muda).
- `components/auth/sign-up-form.tsx` (muda).
- `components/auth/sign-up-form.test.tsx` (muda).

**O que muda**

`signUpWithTeam` passa a devolver o e-mail em vez de só `{ success: true }`:

```ts
return { email: parsedInput.email };
```

E ganha, na chamada de `auth.api.signUpEmail`, o `callbackURL` que define para onde o link do e-mail
leva depois de verificar (fato 9 do fluxo de verificação):

```ts
body: { name, username, email, password, callbackURL: "/verify-email" },
```

Dois comentários novos, obrigatórios porque o código fica contraintuitivo:

- no `try/catch` do `signUpEmail`: `USER_ALREADY_EXISTS` **não chega mais aqui** — e-mail duplicado
  devolve sucesso sintético (fato 6). Quem avisa o dono do e-mail é `onExistingUserSignUp`.
- antes do `updateTeamNameForUser`: quando o e-mail é duplicado, `userId` é um id sintético e este
  `UPDATE` acerta 0 linhas de propósito. **Não** tente detectar isso: detectar é vazar.

`SignUpForm` troca o `onSuccess` (linha 40-44):

```ts
onSuccess: ({ data }) => router.push(`/check-email?email=${encodeURIComponent(data.email)}`),
```

Sem `router.refresh()` — não há sessão nova para refrescar.

**Testes:** em `sign-up-form.test.tsx`, o caso "envia e-mail, nome do time, nickname e senha"
(linha 108) passa a esperar `push("/check-email?email=joao%40example.com")`; o mock de
`next-safe-action/hooks` (linha 19-39) precisa passar `data` para o `onSuccess`. Acrescente um caso
novo: e-mail duplicado (a action devolve sucesso) leva para `/check-email` do mesmo jeito, sem
mostrar erro — é o teste que trava a proteção contra enumeração.

**Como verificar:** `pnpm test components/auth/sign-up-form`.

---

## Fase 4 — Moldura visual nova (`AuthShell` + botões de provedor)

Aqui entram as skills obrigatórias do prompt: invoque `frontend-design` antes de desenhar e
`web-design-guidelines` para revisar o resultado. Use componentes shadcn/ui já instalados
(`components/ui/`: `card`, `button`, `input`, `field`, `separator`, `alert`) antes de criar
qualquer coisa do zero.

**Arquivos**

- `components/auth/auth-shell.tsx` (novo — substitui o papel de `auth-card.tsx`).
- `components/auth/auth-card.tsx` (morre, depois que as duas páginas migrarem).
- `app/(auth)/layout.tsx` (muda).
- `components/auth/provider-buttons.tsx` (novo — generaliza `google-button.tsx`).
- `components/auth/google-button.tsx` e `google-button.test.tsx` (morrem).
- `components/auth/provider-buttons.test.tsx` (novo).
- `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx` (mudam).

**Direção visual** (a identidade é dark mode Valorant, `app/globals.css:59-115`; **nenhuma cor
hard-coded do Tailwind** — só `bg-background`, `text-primary`, `ring-border`, ou `var(--…)` dentro de
valor arbitrário):

- **Duas colunas a partir de `lg`** (`grid lg:grid-cols-[1.1fr_1fr]`, `min-h-screen`). Abaixo de
  `lg`, uma coluna só: o painel de marca vira um cabeçalho de ~20vh.
- **Painel esquerdo (marca):** fundo `bg-background` com um brilho radial de `--primary` em baixa
  opacidade (`bg-[radial-gradient(ellipse_at_30%_20%,color-mix(in_oklab,var(--color-primary)_18%,transparent),transparent_60%)]`)
  e, por cima, listras diagonais finas em `color-mix(... 6% ...)` — o "ângulo" do Valorant sem
  importar imagem nenhuma (`public/` só tem os SVGs do boilerplate, fato a lembrar: não há arte).
  Conteúdo: wordmark grande `VLR` + `FANTASY` (`font-heading`, `tracking-tight`, o `VLR` em
  `text-primary`), uma linha de tagline e três itens curtos ("5 jogadores", "mercado entre rodadas",
  "pontuação real do VCT") em `text-muted-foreground` com um filete `bg-primary` de 2px à esquerda.
  `aria-hidden` no ornamento, nunca no texto.
- **Painel direito (formulário):** card `clip-corner [--clip:20px] border-none ring-1 ring-border
bg-card`, largura `max-w-md`, centralizado vertical. Dentro: `h1` (não `CardTitle` solto — cada
  página precisa de um `h1` real), descrição, slot de conteúdo, e o rodapé de troca de tela.
- **Estados:** alerta de erro com `role="alert"` e `aria-live="polite"` (o `SignInForm` já faz isso —
  `components/auth/sign-in-form.tsx:52-59`); botão com rótulo que muda e `aria-busy` durante o envio;
  `autoComplete` correto em todo campo; foco visível herdado de `outline-ring/50`
  (`app/globals.css:118-120`); alvo de toque ≥ 44px nos botões de provedor.

`AuthShell` recebe `{ title, description, children, footer }` — `footer` como `ReactNode`, não os
três props de texto de hoje (`auth-card.tsx:12-19`), porque `/check-email` e `/reset-password` têm
rodapés que não são "texto + um link".

**`ProviderButtons`** (client): itera `configuredSocialProviders` vindo por prop do Server Component e
renderiza um botão por provedor, com o SVG do Google que já existe
(`google-button.tsx:25-42`) e o do Discord. Cada clique:

```ts
await signIn.social({
  provider,
  callbackURL: "/home",
  errorCallbackURL: "/login", // fato 11: sem isto o erro cai na página em inglês do better-auth
});
```

Se a lista vier vazia, o componente não renderiza nada — nem o separador "OU".

**Login passa a mostrar erro de OAuth:** `app/(auth)/login/page.tsx` lê `searchParams.error` (é uma
Promise no Next 16 — `await searchParams`) e passa a mensagem de `translateOAuthError` para um
`<Alert variant="destructive">` acima do formulário. Sem isso, o retorno de `errorCallbackURL` é uma
tela muda.

**Testes** (`provider-buttons.test.tsx`, RTL, `@/lib/auth-client` mockado no molde de
`google-button.test.tsx:7-10`): renderiza um botão por provedor da lista; o clique chama
`signIn.social` com `provider`, `callbackURL: "/home"` e `errorCallbackURL: "/login"`; lista vazia
não renderiza botão nenhum; botão fica desabilitado durante a navegação.

**Como verificar:** `pnpm test components/auth`, `pnpm lint`, `pnpm build`, e a olho em `/login` e
`/signup` — em 390px, 768px e 1440px de largura.

---

## Fase 5 — "Confirme seu e-mail" e reenvio (`/check-email`)

**Arquivos**

- `app/(auth)/check-email/page.tsx` (novo).
- `components/auth/resend-verification.tsx` (novo).
- `components/auth/resend-verification.test.tsx` (novo).
- `components/auth/sign-in-form.tsx` (muda).

**O que muda**

`/check-email` é público (não entra em `PROTECTED_PREFIXES`, `proxy.ts:12` — confira que nenhum
prefixo novo casa por acidente). Server Component: lê `?email=`, valida com `z.email()` e, se vier
inválido ou ausente, mostra a versão genérica da tela sem o botão de reenvio. Renderiza dentro do
`AuthShell`: ícone de envelope (`lucide-react`), `h1` "Confirme seu e-mail", o e-mail em
`font-medium`, instrução para olhar a caixa de spam, `<ResendVerification email={...} />` e um link
para `/login`.

`ResendVerification` (client):

```ts
await sendVerificationEmail({ email, callbackURL: "/verify-email" });
```

Com **cooldown de 60s** no botão após cada envio (contagem exibida com **dayjs**, conforme o
`CLAUDE.md` — nada de `Date` cru na apresentação), casando com o limite de 3 req/60s do servidor
(fato 13). Em sucesso, `toast.success` via `sonner` (`components/ui/sonner.tsx`, já montado em
`app/layout.tsx:30`) com "Link reenviado. Confira seu e-mail." — **sempre a mesma mensagem**, mesmo
que o e-mail não exista: o endpoint é à prova de enumeração
(`.../api/routes/email-verification.mjs:95-120`) e a UI não pode estragar isso.

`SignInForm` ganha, quando `error.code === "EMAIL_NOT_VERIFIED"`, um link dentro do alerta para
`/check-email?email=<o que foi digitado>`. O `sendOnSignIn: true` já reenviou o link
(`.../api/routes/sign-in.mjs:341-350`), então o texto do botão é "Não recebeu? Reenviar", não
"Enviar".

**Testes** (`resend-verification.test.tsx`): o clique chama `sendVerificationEmail` com o e-mail e o
`callbackURL`; depois do clique o botão fica desabilitado e mostra a contagem; erro do servidor não
revela existência da conta (a mensagem é a mesma do sucesso). Em `sign-in-form.test.tsx`, um caso
novo: `EMAIL_NOT_VERIFIED` renderiza um link para `/check-email` com o e-mail digitado.

**Como verificar:** `pnpm test components/auth`; manualmente, cadastrar e conferir que o console (ou
o Resend) mostrou o link e que a tela de `/check-email` apareceu.

---

## Fase 6 — Página de aterrissagem da verificação (`/verify-email`)

**Arquivos**

- `app/(auth)/verify-email/page.tsx` (novo).

**O que muda**

O link do e-mail aponta para o **endpoint** do better-auth
(`${BETTER_AUTH_URL}/api/auth/verify-email?token=…&callbackURL=/verify-email`), que valida e então
redireciona para o nosso `callbackURL` — com `?error=<código>` em caso de falha
(`.../api/routes/email-verification.mjs:167-169`) ou limpo em caso de sucesso, já **com o cookie de
sessão** graças a `autoSignInAfterVerification` (`email-verification.mjs:295`).

Portanto `/verify-email` é uma página pública que trata três casos, nesta ordem:

1. `searchParams.error` presente → `AuthShell` com `Alert` destrutivo traduzido
   (`translateAuthError` cobre `TOKEN_EXPIRED` e `INVALID_TOKEN`), mais `<ResendVerification />` sem
   e-mail pré-preenchido (um `Input` para digitar) e link para `/login`.
2. Sem erro e **com sessão** (`auth.api.getSession({ headers: await headers() })`, como
   `app/(auth)/login/page.tsx:16`) → `redirect("/home")`. É o caminho feliz: o usuário clicou no link
   e já entra logado.
3. Sem erro e sem sessão (verificou em outro navegador) → tela "E-mail confirmado" com botão para
   `/login`.

**Metadata:** `export const metadata = { title: "Confirmar e-mail | VLR Fantasy" }`.

**Testes:** a página é um Server Component com `redirect` e `headers()` — cobrir por teste RTL dá
pouco retorno. Teste o que é componente puro (o bloco de erro, se extraído) e verifique o resto à
mão; registre isso explicitamente na seção de riscos em vez de escrever um teste que mocka meio Next.

**Como verificar:** com `RESEND_API_KEY` vazio, cadastrar, copiar o link do console e abrir em (a)
mesma aba, (b) aba anônima, (c) duas vezes seguidas — o segundo clique tem de cair no caso 1 com
mensagem em pt-BR, nunca numa página em inglês.

---

## Fase 7 — Recuperação de senha (`/forgot-password` e `/reset-password`)

**Arquivos**

- `lib/validations/auth.ts` (muda).
- `app/(auth)/forgot-password/page.tsx` (novo).
- `components/auth/forgot-password-form.tsx` (novo) + `.test.tsx`.
- `app/(auth)/reset-password/page.tsx` (novo).
- `components/auth/reset-password-form.tsx` (novo) + `.test.tsx`.
- `components/auth/sign-in-form.tsx` (muda — o link "Esqueci minha senha").

**O que muda**

`lib/validations/auth.ts` ganha dois schemas, no estilo dos que já existem (Zod v4, `z.email()`
top-level, mensagens pt-BR — nunca `z.string().email()`):

```ts
export const forgotPasswordSchema = z.object({
  email: z.email("E-mail inválido."),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Deve ter pelo menos 8 caracteres."),
    confirmPassword: z.string().min(8, "Deve ter pelo menos 8 caracteres."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });
```

**`/forgot-password`** — React Hook Form + Zod, chamando direto o cliente (mesmo padrão de
`SignInForm`, que não usa Server Action):

```ts
await requestPasswordReset({
  email: values.email,
  redirectTo: "/reset-password",
});
```

Depois do envio a tela **troca de estado** (não mostra toast e fica igual): some o formulário,
aparece "Se existir uma conta com esse e-mail, enviamos o link de redefinição" — a mesma frase para
e-mail existente e inexistente, espelhando a resposta genérica do servidor
(`.../api/routes/password.mjs:68-71`). Um botão "Enviar de novo" com cooldown de 60s, igual ao da
Fase 5.

**`/reset-password`** — Server Component que lê `searchParams` (fato 9: o GET do better-auth chega
aqui como `?token=…` ou `?error=INVALID_TOKEN`):

- `error` presente ou `token` ausente → `Alert` destrutivo + link para `/forgot-password`.
- `token` presente → `<ResetPasswordForm token={token} />`.

Acrescente no arquivo da página:

```ts
export const metadata: Metadata = {
  title: "Redefinir senha | VLR Fantasy",
  // O token viaja na query. `no-referrer` evita que ele escape no header
  // Referer de qualquer requisição disparada por esta página.
  referrer: "no-referrer",
};
```

`ResetPasswordForm` chama `resetPassword({ newPassword, token })`; em sucesso,
`router.push("/login?reset=1")` e `/login` mostra um `Alert` de sucesso ("Senha redefinida. Entre com
a nova senha."). Como `revokeSessionsOnPasswordReset: true` (suposição 6), toda sessão antiga morre —
diga isso na tela, em uma linha: "Por segurança, você foi desconectado dos outros aparelhos."

`SignInForm` ganha o link "Esqueci minha senha" alinhado à direita do rótulo do campo de senha (o
lugar onde o usuário procura), apontando para `/forgot-password`.

**Testes** (RTL, `@/lib/auth-client` mockado):

- `forgot-password-form.test.tsx`: e-mail malformado mostra "E-mail inválido." e não chama a API;
  submit válido chama `requestPasswordReset` com `redirectTo: "/reset-password"`; **erro
  `USER_NOT_FOUND` do servidor produz exatamente a mesma tela de sucesso** (é o teste que protege a
  não-enumeração); botão desabilitado durante o envio.
- `reset-password-form.test.tsx`: senhas diferentes mostram "As senhas não coincidem." e não chamam a
  API; submit válido chama `resetPassword` com `{ newPassword, token }`; `INVALID_TOKEN` do servidor
  vira "Este link é inválido ou já foi usado. Peça um novo."; sucesso empurra para `/login?reset=1`.
- `sign-in-form.test.tsx`: existe um link acessível "Esqueci minha senha" apontando para
  `/forgot-password`.

**Como verificar:** `pnpm test components/auth`, `pnpm lint`, `pnpm build`. Manualmente, com o
transporte `console`: pedir o link, esperar, clicar, redefinir, conferir que a senha velha não entra
mais e que a sessão de outra aba caiu.

---

## Fase 8 — Fechamento

- Rode `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (suíte inteira) e `pnpm build`. A suíte
  inteira importa: a Fase 3 mexe num teste que já existia (fato 17).
- Revise as cinco telas com a skill `web-design-guidelines`: hierarquia de heading (um `h1` por
  página), rótulo associado a cada campo, `aria-live` nos alertas, ordem de tabulação, contraste do
  `--muted-foreground` (#8b92a0) sobre `--card` (#16181c), e foco visível em todo controle.
- Confira que `pnpm exec prettier --write .` não deixa diff pendente.
- `.env.example` fechado com `RESEND_API_KEY`, `EMAIL_FROM`, `DISCORD_CLIENT_ID`,
  `DISCORD_CLIENT_SECRET`.
- Em produção, antes de subir: `BETTER_AUTH_URL` **precisa** apontar para o domínio real — é a base
  de toda URL de verificação e de reset (`.env:3` hoje é `http://localhost:3000`). Link de confirmação
  apontando para localhost é o modo mais provável de esta feature falhar no deploy.

---

## Riscos e o que fica de fora

**Fora de escopo, de propósito**

- Magic link e código OTP (suposição 4), 2FA, "lembrar deste dispositivo", troca de e-mail da conta,
  exclusão de conta.
- Twitch, GitHub e qualquer outro provedor além de Google e Discord — o mapa de
  `configuredSocialProviders` já deixa a porta aberta.
- Rate limit persistente: o storage padrão é **memória** (`.../context/create-context.mjs:174`), ou
  seja, os contadores zeram a cada deploy/restart e não são compartilhados entre instâncias. Com um
  container só, aceitável. Com mais de um, vira `storage: "database"` e uma tabela nova — plano à parte.
- `app/page.tsx` (a landing) não é redesenhada; só `/login`, `/signup` e as três telas novas.

**Riscos**

1. **Verificação obrigatória derruba a taxa de cadastro.** Todo passo a mais perde gente, e aqui o
   passo depende da entrega de e-mail. Mitigação embutida: `sendOnSignIn: true` (reenvia sozinho),
   `/check-email` com reenvio manual, e Google/Discord como caminho sem e-mail nenhum.
2. **Entrega de e-mail é o ponto único de falha.** Sem domínio verificado no Resend, o remetente
   `onboarding@resend.dev` só entrega para o e-mail dono da conta — em produção **é obrigatório**
   verificar um domínio, senão ninguém recebe nada. `sendEmail` engole o erro de propósito (Fase 0),
   então a falha é silenciosa: o `console.error` é a única pista. Considere, num plano futuro, uma
   coluna de "último envio" para diagnosticar.
3. **Times órfãos.** Quem se cadastra e nunca verifica deixa para trás um `fantasy_team` com 5 vagas
   vazias, um `@login` e um nome de time reservados (suposição 8). Não estraga nada hoje, mas é lixo
   acumulando — e, pior, um nome de time cobiçado pode ficar preso a uma conta fantasma. Uma rotina
   de limpeza (contas não verificadas com mais de 7 dias) é o plano seguinte natural.
4. **O beco do fato 10.** Cadastrou por e-mail, não verificou, tenta o Google com o mesmo e-mail:
   cai em `account_not_linked`. A mensagem da Fase 2 explica o que fazer, mas continua sendo um
   momento ruim. Afrouxar `requireLocalEmailVerified` resolveria e abriria um sequestro de conta
   (criar conta com o e-mail alheio e esperar a vítima entrar pelo Google) — por isso **não** fazemos.
5. **A migration da Fase 1 é irreversível na prática.** Se a suposição 2 estiver errada e a intenção
   for obrigar todo mundo a reverificar, o `UPDATE` já terá passado. Confirme a suposição antes de
   rodar `pnpm db:migrate`.
6. **Cobertura fraca nas páginas Server Component** (`/verify-email`, `/reset-password`): a lógica de
   ramificação delas fica provada só por verificação manual. Se isso incomodar, extraia a decisão
   ("qual estado esta tela mostra?") para uma função pura em `lib/auth/verification-state.ts` e teste
   a função — é o mesmo truque de `lib/team/region-selection.ts`.
7. **`autoSignInAfterVerification: true` significa que quem tiver o link tem a sessão.** O token é de
   uso único e expira em 1h, mas um encaminhamento de e-mail distraído entrega a conta. Desligar a
   flag troca conveniência por uma tela de login a mais; se o usuário preferir, é uma linha na Fase 2
   e o caso 3 da Fase 6 passa a ser o único caminho.
