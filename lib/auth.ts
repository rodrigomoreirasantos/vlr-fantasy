import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { assignUniqueUsername } from "@/lib/auth/username";
import {
  passwordChangedEmail,
  resetPasswordEmail,
  verificationEmail,
} from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { ensureFantasyTeam } from "@/lib/team/queries";

const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);
const twitchConfigured = Boolean(
  process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET,
);

// Reset em 15 minutos, sincronizado com `resetPasswordEmail` (lib/email/templates.ts).

/**
 * O domínio de produção que a própria Vercel informa em runtime (sem
 * protocolo). O `baseURL` (`BETTER_AUTH_URL`) continua sendo a origem
 * principal; este só entra como origem **extra** confiável, para uma troca de
 * domínio na Vercel não recusar todo login e cadastro com `INVALID_ORIGIN`
 * enquanto a variável não é atualizada — foi o que aconteceu ao trocar
 * `vlr-fantasy.vercel.app` por `vlrfantasygame.vercel.app`. Fora da Vercel
 * (dev, testes) a variável não existe e nada muda.
 */
const vercelProductionOrigin = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : null;
const RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS = 15 * 60;

export const auth = betterAuth({
  appName: "VLR Fantasy",
  ...(vercelProductionOrigin && { trustedOrigins: [vercelProductionOrigin] }),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    // Entrar **não** depende de confirmar o e-mail (decisão de 14/09/2026):
    // quem cria a conta já entra jogando, e o cadastro cria a sessão na hora
    // (`autoSignIn`, default `true`). Com a exigência ligada, um e-mail que
    // não chegasse (provedor fora, spam, envio não configurado) deixava a
    // pessoa trancada do lado de fora — foi o que aconteceu em produção.
    //
    // O custo aceito: uma conta pode nascer com e-mail de outra pessoa ou
    // digitado errado. Ver `accountLinking` abaixo para o que continua
    // protegido.
    requireEmailVerification: false,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const email = resetPasswordEmail({
        name: user.name,
        url,
        expiresInMinutes: RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS / 60,
      });
      await sendEmail({ to: user.email, ...email });
    },
    onPasswordReset: async ({ user }) => {
      const email = passwordChangedEmail({ name: user.name });
      await sendEmail({ to: user.email, ...email });
    },
  },
  emailVerification: {
    // O link de confirmação continua saindo no cadastro — só não trava mais o
    // login. Explícito porque o default (`undefined`) segue
    // `requireEmailVerification` e deixaria de enviar.
    sendOnSignUp: true,
    // Quem clica no link de verificação já entra logado em `/home`.
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const email = verificationEmail({ name: user.name, url });
      await sendEmail({ to: user.email, ...email });
    },
  },
  // `account.accountLinking.requireLocalEmailVerified` fica no default
  // (`true`) de propósito: afrouxá-lo permitiria sequestrar uma conta criada
  // com um e-mail alheio e nunca verificada, entrando por OAuth com o mesmo
  // e-mail. O caso "cadastrou por e-mail, não verificou, tenta o Google/
  // Twitch com o mesmo e-mail" é tratado com mensagem
  // (`translateOAuthError("account_not_linked")`), não afrouxando a política.
  //
  // Sem a verificação obrigatória, essa trava pesa ainda mais: é ela que
  // impede quem cadastrou o e-mail de outra pessoa com senha de passar a
  // controlar a conta Google/Twitch dessa pessoa. O efeito colateral aceito é
  // o dono do e-mail não conseguir entrar pelo Google até confirmar o e-mail
  // ou redefinir a senha.
  //
  // `rateLimit` também fica no default: já cobre sign-in/sign-up (3 req/10s)
  // e request-password-reset/send-verification-email (3 req/60s) — ver
  // `api/rate-limiter/index.mjs`. Não inventar regra própria.
  socialProviders: {
    ...(googleConfigured && {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      },
    }),
    ...(twitchConfigured && {
      twitch: {
        clientId: process.env.TWITCH_CLIENT_ID as string,
        clientSecret: process.env.TWITCH_CLIENT_SECRET as string,
      },
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Contas sem login no payload (ex. Google/Twitch) recebem um
          // `@login` gerado a partir do e-mail. Feito aqui, e não em
          // `create.before`, porque só com a linha já inserida dá para
          // tratar a corrida entre dois cadastros que derivam o mesmo
          // candidato — `assignUniqueUsername` captura a violação de
          // unicidade e tenta o próximo login.
          const assignedUsername = await assignUniqueUsername(
            user.id,
            user.email?.split("@")[0] || user.name,
          );

          // Todo usuário novo já nasce com um fantasy_team e as cinco vagas
          // vazias da escalação — ver `ensureFantasyTeam` (lib/team/queries.ts).
          // O nome nasce do `@login` (já único) — não do nome de exibição,
          // que pode se repetir entre usuários.
          //
          // Isso roda no cadastro, antes da verificação de e-mail: `@login`
          // e nome de time já nascem reservados mesmo que o usuário nunca
          // confirme o e-mail (ver plano 19, suposição 8).
          await ensureFantasyTeam(user.id, assignedUsername ?? user.name);
        },
      },
    },
  },
  plugins: [
    username({ minUsernameLength: 3, maxUsernameLength: 20 }),
    // O plugin de cookies do Next.js precisa ser sempre o último.
    nextCookies(),
  ],
});

export const isGoogleConfigured = googleConfigured;

export type SocialProviderId = "google" | "twitch";

/** Lista tipada — a UI itera sobre ela para renderizar um botão por provedor. */
export const configuredSocialProviders: SocialProviderId[] = [
  ...(googleConfigured ? (["google"] as const) : []),
  ...(twitchConfigured ? (["twitch"] as const) : []),
];
