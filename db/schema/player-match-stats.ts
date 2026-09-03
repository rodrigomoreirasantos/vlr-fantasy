import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { match } from "@/db/schema/matches";
import { player } from "@/db/schema/players";

/**
 * A estatística de um jogador **em um mapa**. Nunca a linha agregada da série
 * (`data-game-id="all"` no vlr): o agregado é uma `SUM` sobre estas linhas, e
 * guardá-lo junto convidaria a somar duas vezes.
 *
 * É a tabela que fecha o circuito `stats → pontos`: `fantasyPoints` sai de
 * `mapPoints` (lib/scoring/scout.ts) e `calculateRound` a soma em
 * `player.score`, de onde o motor de preço e a classificação já sabem seguir.
 */
export const playerMatchStat = pgTable(
  "player_match_stat",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => match.id, { onDelete: "cascade" }),
    // `restrict`: apagar um jogador que já pontuou apagaria história de
    // rodada. Se for para sair do catálogo, é `active: false`.
    playerId: uuid("player_id")
      .notNull()
      .references(() => player.id, { onDelete: "restrict" }),
    /** Nome do mapa, ex. "Ascent". Descritivo — a chave é `gameVlrId`. */
    mapName: text("map_name").notNull(),
    /**
     * `data-game-id` do vlr — o id externo do mapa dentro da série, e a chave
     * natural da linha. O nome do mapa não serve: a mesma série pode repeti-lo.
     */
    gameVlrId: text("game_vlr_id").notNull(),
    agent: text("agent"),
    rating: numeric("rating", { precision: 5, scale: 2, mode: "number" }),
    acs: integer("acs"),
    kills: integer("kills"),
    deaths: integer("deaths"),
    assists: integer("assists"),
    kast: integer("kast"),
    adr: integer("adr"),
    headshotPct: integer("headshot_pct"),
    firstKills: integer("first_kills"),
    firstDeaths: integer("first_deaths"),
    /** Venceu **este mapa** — é o que alimenta o bônus de vitória do scout. */
    won: boolean("won").notNull().default(false),
    fantasyPoints: numeric("fantasy_points", {
      precision: 6,
      scale: 1,
      mode: "number",
    })
      .notNull()
      .default(0),
    /**
     * `SCOUT_VERSION` usada no cálculo. Sem ela, pontuações de eras diferentes
     * ficariam indistinguíveis no banco e um reprocessamento parcial passaria
     * despercebido.
     */
    scoutVersion: integer("scout_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [
    // A idempotência do reprocessamento em uma linha: reparsar o mesmo HTML
    // atualiza as mesmas linhas, nunca duplica a rodada de ninguém.
    uniqueIndex("player_match_stat_game_uidx").on(
      t.matchId,
      t.playerId,
      t.gameVlrId,
    ),
    // O histórico do jogador ("últimas 5 partidas") e o índice da FK.
    index("player_match_stat_player_idx").on(t.playerId, t.matchId),
    check(
      "player_match_stat_kills_non_negative",
      sql`${t.kills} IS NULL OR ${t.kills} >= 0`,
    ),
    check(
      "player_match_stat_deaths_non_negative",
      sql`${t.deaths} IS NULL OR ${t.deaths} >= 0`,
    ),
  ],
);
