import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { EVENT_REGIONS } from "@/lib/round/regions";
import { PLAYER_AVAILABILITIES, PLAYER_ROLES } from "@/lib/team/types";

// Import unidirecional: o schema conhece o tipo de domínio, nunca o
// contrário. `PLAYER_ROLES` vive em `lib/team/types.ts` — única fonte da
// lista de funções, reaproveitada pela UI para agrupar o mercado.
export const playerRole = pgEnum("player_role", PLAYER_ROLES);

/**
 * Reusado por `player.region`, `fantasy_team.region` e `championship.region`
 * — as seis regiões do circuito (`EVENT_REGIONS`, lib/round/regions.ts), um
 * enum só no Postgres para as três tabelas.
 */
export const eventRegionEnum = pgEnum("event_region", EVENT_REGIONS);

/** Estados do jogo (lista fechada) — não confundir com `active`, que é o catálogo do mercado. */
export const playerAvailability = pgEnum(
  "player_availability",
  PLAYER_AVAILABILITIES,
);

export const player = pgTable(
  "player",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Id externo do vlr.gg — a chave natural do jogador, agora que o
     * scoreboard a expõe (`/player/49871/yuno`). **Nullable de propósito:** os
     * registros do seed nasceram sem ela, e o unique com `NULLS DISTINCT`
     * (padrão do Postgres) deixa vários nulos conviverem — o mesmo truque de
     * `roster_slot_team_player_uidx`.
     */
    vlrId: text("vlr_id"),
    nickname: text("nickname").notNull(),
    /** Nome civil, quando o vlr traz. */
    realName: text("real_name"),
    /** Código de duas letras da bandeira do vlr, ex. "br". */
    country: text("country"),
    /** Organização do jogador na vida real, ex. "FNATIC". */
    team: text("team").notNull(),
    agent: text("agent").notNull(),
    role: playerRole("role").notNull(),
    /**
     * A liga a que o jogador pertence — o filtro do mercado regional
     * (`.claude/plans/10-time-por-regiao.md`). Nunca `"international"`:
     * Masters/Champions não mudam a liga de ninguém, só o time Internacional
     * lê esses eventos (via organizações classificadas, não via esta coluna).
     * `"other"` é o default de quem ainda não tem partida de liga nenhuma —
     * fica fora das 5 abas até o scrap resolver.
     */
    region: eventRegionEnum("region").notNull().default("other"),
    /**
     * Quando `region` veio de uma partida do **próprio** jogador — `null`
     * quando é provisória, emprestada da organização (degrau 2 da cascata em
     * `lib/player/region.ts`). É o que torna "evento mais recente" verdadeiro
     * independente da ordem em que o scrap/backfill processa as partidas.
     */
    regionSourceAt: timestamp("region_source_at", { withTimezone: true }),
    /**
     * Preço no catálogo, em centavos de crédito. Nunca misturar com `score`:
     * o sufixo `Cents` marca tudo que é moeda.
     */
    priceCents: integer("price_cents").notNull(),
    /** Pontuação acumulada na rodada corrente. `score` nunca entra em conta de dinheiro. */
    score: numeric("score", { precision: 6, scale: 1, mode: "number" })
      .notNull()
      .default(0),
    active: boolean("active").notNull().default(true),
    /**
     * A resolução de identidade não bateu com confiança (nickname colidindo
     * entre vlrIds diferentes, agente desconhecido). Nasce `active: false`:
     * fica fora do mercado até alguém olhar. **Nunca duplicamos jogador em
     * silêncio** — duplicar é pior que segurar.
     */
    needsReview: boolean("needs_review").notNull().default(false),
    /** Rodadas já pontuadas — alimenta o amortecimento de `dampingFactor`. */
    gamesPlayed: integer("games_played").notNull().default(0),
    /** Média histórica de pontos, base do preço inicial do backfill. */
    averageScore: numeric("average_score", {
      precision: 6,
      scale: 1,
      mode: "number",
    })
      .notNull()
      .default(0),
    /** Disponibilidade para a próxima rodada — alimenta os alertas da Home. */
    availability: playerAvailability("availability")
      .notNull()
      .default("available"),
    /** Detalhe opcional em pt-BR, ex. "Fora por lesão no pulso". */
    availabilityNote: text("availability_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("player_nickname_uidx").on(table.nickname),
    uniqueIndex("player_vlr_id_uidx").on(table.vlrId),
    // Query exata do mercado: candidatos ativos de uma função.
    index("player_role_active_idx").on(table.role, table.active),
    // Query exata do mercado regional: candidatos ativos de uma função, numa região.
    index("player_region_role_active_idx").on(
      table.region,
      table.role,
      table.active,
    ),
    // O mercado do time Internacional filtra por organização, não por região.
    index("player_team_idx").on(table.team),
    check("player_price_cents_positive", sql`${table.priceCents} > 0`),
    check(
      "player_region_not_international",
      sql`${table.region} <> 'international'`,
    ),
  ],
);
