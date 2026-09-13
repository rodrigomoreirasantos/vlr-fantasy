import type { fantasyIdentity, fantasyTeam, player, round } from "@/db/schema";
import { parseCrest } from "@/lib/crest/crest";
import type { MarketScope } from "@/lib/market/scope";
import { slotWarning } from "@/lib/market/scope";
import { formatTimeLeft } from "@/lib/market/window";
import { toPlayerRegion, type TeamRegion } from "@/lib/round/regions";
import type { Player, RosterSlot, TeamSummary } from "@/lib/team/types";

// Tipos de linha via `$inferSelect` — nunca redeclarados.
type PlayerRow = typeof player.$inferSelect;
type FantasyTeamRow = typeof fantasyTeam.$inferSelect;
type FantasyIdentityRow = typeof fantasyIdentity.$inferSelect;
type RoundRow = typeof round.$inferSelect;
type RosterSlotWithPlayerRow = {
  id: string;
  position: number;
  captain: boolean;
  player: PlayerRow | null;
};

export function toDomainPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    nickname: row.nickname,
    team: row.team,
    agent: row.agent,
    role: row.role,
    score: row.score,
    priceCents: row.priceCents,
    formPoints: row.formPoints,
    active: row.active,
    availability: row.availability,
    availabilityNote: row.availabilityNote,
    region: toPlayerRegion(row.region),
    photoUrl: row.photoUrl,
  };
}

/**
 * Sempre devolve exatamente 5 vagas ordenadas por posição, completando com
 * vagas vazias quando faltar linha — assim nenhum componente de apresentação
 * (`PlayerRow`, `FormationBoard`) precisa saber que o dado agora vem do
 * banco. `scope` decide o alerta de cada vaga ocupada (`slotWarning`,
 * lib/market/scope.ts) — o escopo do **time**, não da vaga.
 */
export function toRosterSlots(
  rows: readonly RosterSlotWithPlayerRow[],
  scope: MarketScope,
): RosterSlot[] {
  const byPosition = new Map(rows.map((row) => [row.position, row]));

  return Array.from({ length: 5 }, (_, index) => {
    const row = byPosition.get(index + 1);
    if (!row) return { id: null, player: null, captain: false, warning: null };

    const player = row.player ? toDomainPlayer(row.player) : null;
    return {
      id: row.id,
      player,
      captain: row.captain,
      warning: player ? slotWarning(scope, player) : null,
    };
  });
}

export function toTeamSummary(
  team: FantasyTeamRow,
  identity: FantasyIdentityRow,
  region: TeamRegion,
  activeRound: RoundRow | null,
  points: number,
  /** O próximo fechamento entre as partidas do circuito (`nextMarketClose`). */
  market: { closesAt: Date | null },
  /** Soma dos preços das 5 vagas — ver `TeamSummary.squadValueCents`. */
  squadValueCents: number,
  /** Ganho/perda da última rodada fechada — `null` sem rodada fechada ainda. */
  lastSquadValuationCents: number | null,
): TeamSummary {
  return {
    name: identity.name,
    crest: parseCrest({
      shape: identity.crestShape,
      symbol: identity.crestSymbol,
      background: identity.crestBg,
      foreground: identity.crestFg,
      border: identity.crestBorder,
    }),
    points,
    balanceCents: team.balanceCents,
    squadValueCents,
    lastSquadValuationCents,
    region,
    market: {
      // "Operando", não "aberto para todos": quem tranca é a regra do dia,
      // campeonato a campeonato (`lockedOrganizations`). Sem rodada ativa não
      // há onde registrar a transferência, e aí sim nada se move.
      open: activeRound !== null,
      closesIn: market.closesAt
        ? formatTimeLeft(market.closesAt)
        : activeRound
          ? "Nenhum jogo marcado"
          : "Nenhuma rodada ativa",
      closesAt: market.closesAt,
    },
  };
}
