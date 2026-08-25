import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db";
import * as schema from "@/db/schema";
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
        // Todo usuário novo já nasce com um fantasy_team e as cinco vagas
        // vazias da escalação — ver `ensureFantasyTeam` (lib/team/queries.ts).
        after: async (user) => {
          await ensureFantasyTeam(user.id, user.name);
        },
      },
    },
  },
  // O plugin de cookies do Next.js precisa ser sempre o último.
  plugins: [nextCookies()],
});

export const isGoogleConfigured = googleConfigured;
