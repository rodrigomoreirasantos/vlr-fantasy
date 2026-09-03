import { z } from "zod";

import { MATCH_STATUSES } from "@/lib/round/types";

/**
 * O contrato de saída de cada scraper. **Nada é persistido sem passar por
 * aqui**: o parser pode devolver `NaN` por um `data-col` novo, ou string vazia
 * por um seletor que mudou — o Zod é onde isso vira erro em vez de virar linha
 * no banco.
 *
 * Schemas internos: as mensagens ficam em inglês, como o CLAUDE.md permite
 * para o que nunca chega ao jogador.
 */

/** Id externo do vlr.gg — sempre uma string de dígitos. */
const vlrId = z.string().regex(/^\d+$/, "expected a numeric vlr.gg id");

const statNumber = z.number().finite().nullable();

export const scrapedPlayerStatSchema = z.object({
  vlrId,
  nickname: z.string().min(1),
  /** Sigla da organização no scoreboard, ex. "FLY". */
  teamTag: z.string().nullable(),
  /**
   * Qual dos dois times da partida — `"a"` é o da esquerda no cabeçalho. Vem
   * da ordem das tabelas do mapa, e é o que liga o jogador ao **nome** da
   * organização: o scoreboard só traz a sigla.
   */
  teamSide: z.enum(["a", "b"]),
  country: z.string().nullable(),
  agents: z.array(z.string().min(1)),
  rating: statNumber,
  acs: statNumber,
  kills: statNumber,
  deaths: statNumber,
  assists: statNumber,
  kast: statNumber,
  adr: statNumber,
  headshotPct: statNumber,
  firstKills: statNumber,
  firstDeaths: statNumber,
  /** O jogador venceu **este mapa**? É o que alimenta o bônus do scout. */
  won: z.boolean(),
});
export type ScrapedPlayerStat = z.infer<typeof scrapedPlayerStatSchema>;

export const scrapedMapSchema = z.object({
  /** `data-game-id` — a chave que separa os mapas dentro da mesma série. */
  gameVlrId: vlrId,
  name: z.string().min(1),
  durationSeconds: z.number().int().positive().nullable(),
  scoreA: z.number().int().nonnegative().nullable(),
  scoreB: z.number().int().nonnegative().nullable(),
  players: z.array(scrapedPlayerStatSchema).min(1),
});
export type ScrapedMap = z.infer<typeof scrapedMapSchema>;

export const scrapedMatchTeamSchema = z.object({
  vlrId: vlrId.nullable(),
  name: z.string().min(1),
});

export const scrapedMatchDetailSchema = z.object({
  vlrId,
  event: z.object({
    vlrId: vlrId.nullable(),
    name: z.string().min(1),
    series: z.string().nullable(),
  }),
  /** Já convertido de America/New_York para UTC — ver `normalize/kickoff.ts`. */
  scheduledAt: z.date(),
  teamA: scrapedMatchTeamSchema,
  teamB: scrapedMatchTeamSchema,
  scoreA: z.number().int().nonnegative().nullable(),
  scoreB: z.number().int().nonnegative().nullable(),
  bestOf: z.number().int().positive().nullable(),
  status: z.enum(MATCH_STATUSES),
  maps: z.array(scrapedMapSchema),
});
export type ScrapedMatchDetail = z.infer<typeof scrapedMatchDetailSchema>;

export const scrapedMatchListItemSchema = z.object({
  vlrId,
  teamA: z.string().min(1),
  teamB: z.string().min(1),
  scoreA: z.number().int().nonnegative().nullable(),
  scoreB: z.number().int().nonnegative().nullable(),
  /**
   * Horário aproximado, montado a partir do cabeçalho de dia + `.match-item-time`.
   * O horário confiável vem do detalhe (`data-utc-ts`); a lista serve para
   * descobrir **quais** partidas existem.
   */
  scheduledAt: z.date().nullable(),
  status: z.enum(MATCH_STATUSES),
  event: z.string().min(1),
  eventSeries: z.string().nullable(),
});
export type ScrapedMatchListItem = z.infer<typeof scrapedMatchListItemSchema>;

export const scrapedEventSchema = z.object({
  vlrId,
  name: z.string().min(1),
  status: z.string().min(1),
  region: z.string().nullable(),
  startsAt: z.date().nullable(),
  endsAt: z.date().nullable(),
});
export type ScrapedEvent = z.infer<typeof scrapedEventSchema>;

export const scrapedRosterPlayerSchema = z.object({
  vlrId,
  nickname: z.string().min(1),
  realName: z.string().nullable(),
  country: z.string().nullable(),
});

export const scrapedTeamRosterSchema = z.object({
  vlrId,
  name: z.string().min(1),
  tag: z.string().nullable(),
  region: z.string().nullable(),
  /** Só jogadores — staff (coach, manager) é filtrado no parser. */
  players: z.array(scrapedRosterPlayerSchema),
});
export type ScrapedTeamRoster = z.infer<typeof scrapedTeamRosterSchema>;

/** Valida a saída de um scraper, com o contexto no erro. */
export function parseScraped<T>(
  schema: z.ZodType<T>,
  value: unknown,
  context: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Scraper output failed validation (${context}): ${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
