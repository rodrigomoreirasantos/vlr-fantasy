import type { fantasyTeam, player, round } from "@/db/schema";
import { parseCrest } from "@/lib/crest/crest";
import { formatTimeLeft } from "@/lib/market/window";
import type { Player, RosterSlot, TeamSummary } from "@/lib/team/types";

// Tipos de linha via `$inferSelect` — nunca redeclarados.
type PlayerRow = typeof player.$inferSelect;
type FantasyTeamRow = typeof fantasyTeam.$inferSelect;
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
    active: row.active,
    availability: row.availability,
    availabilityNote: row.availabilityNote,
  };
}

/**
 * Sempre devolve exatamente 5 vagas ordenadas por posição, completando com
 * vagas vazias quando faltar linha — assim nenhum componente de apresentação
 * (`PlayerRow`, `FormationBoard`) precisa saber que o dado agora vem do
 * banco.
 */
export function toRosterSlots(
  rows: readonly RosterSlotWithPlayerRow[],
): RosterSlot[] {
  const byPosition = new Map(rows.map((row) => [row.position, row]));

  return Array.from({ length: 5 }, (_, index) => {
    const row = byPosition.get(index + 1);
    if (!row) return { id: null, player: null, captain: false };
    return {
      id: row.id,
      player: row.player ? toDomainPlayer(row.player) : null,
      captain: row.captain,
    };
  });
}

export function toTeamSummary(
  team: FantasyTeamRow,
  activeRound: RoundRow | null,
  points: number,
  /** O próximo fechamento entre as partidas do circuito (`nextMarketClose`). */
  market: { closesAt: Date | null },
): TeamSummary {
  return {
    name: team.name,
    crest: parseCrest({
      shape: team.crestShape,
      symbol: team.crestSymbol,
      background: team.crestBg,
      foreground: team.crestFg,
      border: team.crestBorder,
    }),
    points,
    balanceCents: team.balanceCents,
    scoredMatches: {
      played: activeRound?.scoredMatches ?? 0,
      total: activeRound?.totalMatches ?? 0,
    },
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
