import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { assignUniqueUsername } from "@/lib/auth/username";
import { ensureFantasyTeam } from "@/lib/team/queries";

const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

export const auth = betterAuth({
  appName: "VLR Fantasy",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  socialProviders: {
    ...(googleConfigured && {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      },
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Contas sem login no payload (ex. Google) recebem um `@login`
          // gerado a partir do e-mail. Feito aqui, e não em `create.before`,
          // porque só com a linha já inserida dá para tratar a corrida entre
          // dois cadastros que derivam o mesmo candidato — `assignUniqueUsername`
          // captura a violação de unicidade e tenta o próximo login.
          await assignUniqueUsername(
            user.id,
            user.email?.split("@")[0] || user.name,
          );

          // Todo usuário novo já nasce com um fantasy_team e as cinco vagas
          // vazias da escalação — ver `ensureFantasyTeam` (lib/team/queries.ts).
          await ensureFantasyTeam(user.id, user.name);
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
