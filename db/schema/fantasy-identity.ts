import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "@/db/schema/auth";
import { DEFAULT_CREST } from "@/lib/crest/crest";

/**
 * A identidade do usuário no jogo — nome e brasão — separada de
 * `fantasy_team` desde "um time por região" (`.claude/plans/10-time-por-regiao.md`,
 * decisão 6). Um usuário tem 5 `fantasy_team` (um por região) mas uma única
 * identidade: o nome e o brasão são do usuário, não de um time regional
 * específico. PK = `userId` faz "um por usuário" ser estrutura, não índice —
 * o mesmo motivo pelo qual `fantasy_team_user_uidx` existia antes.
 *
 * Não vive em `db/schema/auth.ts` de propósito: aquele arquivo é território
 * do better-auth, e regenerá-lo não pode arrastar nome/brasão junto.
 */
export const fantasyIdentity = pgTable(
  "fantasy_identity",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Brasão do time: dado, não imagem — mesmo esquema de `fantasy_team`
    // antes desta migração (forma + símbolo + 3 cores de paleta).
    crestShape: text("crest_shape").notNull().default(DEFAULT_CREST.shape),
    crestSymbol: text("crest_symbol").notNull().default(DEFAULT_CREST.symbol),
    crestBg: text("crest_bg").notNull().default(DEFAULT_CREST.background),
    crestFg: text("crest_fg").notNull().default(DEFAULT_CREST.foreground),
    crestBorder: text("crest_border").notNull().default(DEFAULT_CREST.border),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    // Quando o usuário concluiu ou pulou o tour guiado (lib/tour/). `null` =
    // o layout ainda abre o tour sozinho no próximo carregamento — nasce
    // `null` para todo mundo, contas antigas incluídas, sem backfill.
    tourCompletedAt: timestamp("tour_completed_at", { withTimezone: true }),
  },
  (table) => [
    // Nome do time único globalmente, ignorando maiúsculas e espaços nas
    // bordas — a mesma regra e a mesma chave que `fantasy_team_name_uidx`
    // aplicava antes de a identidade subir para o usuário.
    uniqueIndex("fantasy_identity_name_uidx").on(
      sql`lower(btrim(${table.name}))`,
    ),
  ],
);
