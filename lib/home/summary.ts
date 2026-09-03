import type { RankedStanding } from "@/lib/championship/types";
import { availabilityMessage } from "@/lib/round/format";
import type {
  LiveRoundScore,
  PriceMover,
  RoundMatch,
  RoundScorer,
  RoundTeamResult,
} from "@/lib/round/types";
import { averagePoints, priceDeltaCents } from "@/lib/scoring/pricing";
import type { RosterSlot } from "@/lib/team/types";
import type { LineupAlert } from "@/lib/home/types";

/**
 * Regras puras da Home — sem banco, sem React. `lib/home/queries.ts` é o
 * único chamador; cada função aqui é testável em milissegundos.
 */

/** Patrimônio: saldo + valor do elenco (`round_team_result`). */
export function patrimonyCents(result: RoundTeamResult): number {
  return result.balanceCents + result.squadValueCents;
}

/**
 * Variação de patrimônio em relação à rodada anterior. `null` sem rodada
 * anterior — a primeira rodada fechada não inventa variação.
 */
export function patrimonyDeltaCents(
  current: RoundTeamResult,
  previous: RoundTeamResult | null,
): number | null {
  if (!previous) return null;
  return patrimonyCents(current) - patrimonyCents(previous);
}

export type PlacementChange = {
  position: number;
  memberCount: number;
  /** `previousPosition - currentPosition`: positivo subiu, negativo desceu, `null` sem rodada anterior. */
  change: number | null;
};

/**
 * Posição do usuário na classificação atual, com a variação em relação à
 * classificação anterior. `null` quando o usuário não está na classificação
 * atual (não deveria acontecer para um campeonato do próprio usuário, mas a
 * função não assume). `change` fica `null` sem classificação anterior — o
 * usuário "estreou" no campeonato, ou é a primeira rodada fechada.
 */
export function placementChanges(
  current: readonly RankedStanding[],
  previous: readonly RankedStanding[] | null,
  userId: string,
): PlacementChange | null {
  const currentRow = current.find((row) => row.userId === userId);
  if (!currentRow) return null;

  const previousRow = previous?.find((row) => row.userId === userId) ?? null;

  return {
    position: currentRow.position,
    memberCount: current.length,
    change: previousRow ? previousRow.position - currentRow.position : null,
  };
}

/**
 * Um alerta por jogador dos 5 que não deve jogar a próxima rodada: vaga
 * vazia, indisponibilidade (`availability` ≠ `available`) ou organização sem
 * partida marcada. Quando um jogador acumula os dois últimos motivos, a
 * indisponibilidade vence — é o motivo mais específico. Silêncio (`[]`)
 * quando os 5 jogam.
 */
export function lineupAlerts(
  roster: readonly RosterSlot[],
  matches: readonly RoundMatch[],
): LineupAlert[] {
  const scheduledOrganizations = new Set(
    matches.flatMap((match) => [match.teamA, match.teamB]),
  );

  return roster.flatMap((slot, index): LineupAlert[] => {
    const position = index + 1;

    if (!slot.player) {
      return [{ position, message: `A vaga ${position} está vazia.` }];
    }

    const { player } = slot;

    if (player.availability !== "available") {
      return [
        {
          position,
          message: availabilityMessage(
            player.nickname,
            player.availability,
            player.availabilityNote,
          ),
        },
      ];
    }

    if (!scheduledOrganizations.has(player.team)) {
      return [
        {
          position,
          message: `${player.nickname} (${player.team}) não tem partida nesta rodada.`,
        },
      ];
    }

    return [];
  });
}

/**
 * Os destaques da rodada **ainda aberta**, projetados a partir do que já foi
 * jogado. Existe porque o usuário não pode esperar o fechamento para saber
 * quem está indo bem: os jogos terminam ao longo da semana e a Home tem que
 * andar junto.
 *
 * A projeção de preço reusa `priceDeltaCents` — a mesma função que
 * `closeActiveRound` aplica de verdade — com a média **da rodada**, calculada
 * só sobre quem jogou (mesmo recorte do fechamento). Ela é uma previsão, não
 * uma promessa: enquanto faltar jogo, a média muda e o delta muda com ela. É
 * por isso que a tela rotula esses destaques como parciais.
 */
export function projectRoundHighlights(
  scores: readonly LiveRoundScore[],
  limit: number,
): {
  topScorer: RoundScorer | null;
  risers: PriceMover[];
  fallers: PriceMover[];
} {
  const average = averagePoints(scores.map((score) => score.points));

  const movers = scores.map((score) => ({
    playerId: score.playerId,
    nickname: score.nickname,
    team: score.team,
    role: score.role,
    priceDeltaCents: priceDeltaCents({
      priceCents: score.priceCents,
      points: score.points,
      averagePoints: average,
      gamesPlayed: score.gamesPlayed,
    }),
  }));

  const [topScorer] = [...scores]
    .sort((a, b) => b.points - a.points)
    .map((score) => ({
      playerId: score.playerId,
      nickname: score.nickname,
      team: score.team,
      role: score.role,
      points: Math.round(score.points * 10) / 10,
    }));

  return {
    topScorer: topScorer ?? null,
    // O mesmo filtro de sinal de `getRoundPriceMovers`: delta zero não é
    // valorização, e sem ele o mesmo jogador apareceria nas duas listas.
    risers: movers
      .filter((mover) => mover.priceDeltaCents > 0)
      .sort((a, b) => b.priceDeltaCents - a.priceDeltaCents)
      .slice(0, limit),
    fallers: movers
      .filter((mover) => mover.priceDeltaCents < 0)
      .sort((a, b) => a.priceDeltaCents - b.priceDeltaCents)
      .slice(0, limit),
  };
}
