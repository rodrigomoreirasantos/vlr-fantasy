import "dotenv/config";

import dayjs from "dayjs";
import { eq } from "drizzle-orm";
import { pathToFileURL } from "node:url";

import { db, pool } from "@/db";
import {
  player,
  round,
  roundPlayerScore,
  roundRoster,
  roundTeamResult,
} from "@/db/schema";
import { isMarketOpen } from "@/lib/market/window";
import { averagePoints, nextPriceCents } from "@/lib/scoring/pricing";
import { teamPoints } from "@/lib/scoring/team";
import { getActiveRound, type Transaction } from "@/lib/team/queries";

/** Janela de mercado da rodada criada quando não há nenhuma `upcoming` esperando. */
const DEFAULT_MARKET_WINDOW_DAYS = 3;

/**
 * Fecha a rodada ativa: congela os três snapshots (`round_player_score`,
 * `round_roster`, `round_team_result`), reprecifica o catálogo, zera os
 * scores e promove a próxima rodada — tudo dentro de uma única transação.
 * Idempotente por construção: sem rodada `active`, não faz nada e devolve
 * `null`. Dois consumidores: o script `pnpm db:round:close` (abaixo) e
 * `db/seed.ts`, que a chama uma vez para o ambiente de desenvolvimento
 * nascer com uma rodada fechada de verdade — nenhuma regra é escrita duas
 * vezes.
 */
export async function closeActiveRound(
  // `Transaction`, não `Querier`: fechar rodada mexe em saldo e pontuação de
  // todo mundo, e o CLAUDE.md exige transação — tipar assim torna
  // `closeActiveRound(db)` impossível por construção.
  tx: Transaction,
): Promise<{ closedRoundId: string; nextRoundId: string } | null> {
  const activeRound = await getActiveRound(tx);
  if (!activeRound) return null;

  // 1. Catálogo + preços — a média da rodada e o novo preço de cada jogador,
  // calculados uma única vez e reaproveitados no snapshot e na repreçificação.
  const players = await tx.select().from(player);
  const average = averagePoints(players.map((row) => row.score));
  const nextPriceById = new Map(
    players.map((row) => [
      row.id,
      nextPriceCents({
        priceCents: row.priceCents,
        points: row.score,
        averagePoints: average,
      }),
    ]),
  );

  if (players.length > 0) {
    await tx.insert(roundPlayerScore).values(
      players.map((row) => {
        const priceAfterCents = nextPriceById.get(row.id)!;
        return {
          roundId: activeRound.id,
          playerId: row.id,
          points: row.score,
          priceBeforeCents: row.priceCents,
          priceAfterCents,
          priceDeltaCents: priceAfterCents - row.priceCents,
        };
      }),
    );
  }

  // 2. Times — escalação congelada e resultado, com os preços de **antes**
  // da repreçificação (o valor do elenco durante a rodada que acabou).
  const teams = await tx.query.fantasyTeam.findMany({
    with: {
      slots: {
        orderBy: (slot, { asc }) => [asc(slot.position)],
        with: { player: true },
      },
    },
  });

  for (const team of teams) {
    const points = teamPoints(
      team.slots.map((slot) => ({
        player: slot.player ? { score: slot.player.score } : null,
        captain: slot.captain,
      })),
    );
    const squadValueCents = team.slots.reduce(
      (total, slot) => total + (slot.player?.priceCents ?? 0),
      0,
    );

    // O guarda espelha o do catálogo acima: o Drizzle rejeita `values([])`, e
    // um time sem nenhuma linha de vaga não pode derrubar o fechamento.
    if (team.slots.length > 0) {
      await tx.insert(roundRoster).values(
        team.slots.map((slot) => ({
          roundId: activeRound.id,
          fantasyTeamId: team.id,
          position: slot.position,
          playerId: slot.playerId,
          captain: slot.captain,
          points: slot.player?.score ?? 0,
          priceCents: slot.player?.priceCents ?? 0,
        })),
      );
    }

    await tx.insert(roundTeamResult).values({
      roundId: activeRound.id,
      fantasyTeamId: team.id,
      points,
      balanceCents: team.balanceCents,
      squadValueCents,
    });
  }

  // 3. Repreça o catálogo e zera os scores — depois de gravar os snapshots,
  // que precisavam do preço e da pontuação de antes.
  for (const row of players) {
    await tx
      .update(player)
      .set({ priceCents: nextPriceById.get(row.id)!, score: 0 })
      .where(eq(player.id, row.id));
  }

  // 4. Finaliza a rodada ativa **antes** de promover a próxima —
  // `round_single_active_uidx` só admite uma linha `active`.
  await tx
    .update(round)
    .set({ status: "finished" })
    .where(eq(round.id, activeRound.id));

  const nextUpcoming = await tx.query.round.findFirst({
    where: eq(round.status, "upcoming"),
    orderBy: (row, { asc }) => [asc(row.number)],
  });

  // Janela padrão para a rodada que assume agora — a mesma constante nos dois
  // ramos, porque a garantia é a mesma: o jogo nunca fica sem mercado.
  const opensAt = new Date();
  const closesAt = dayjs(opensAt)
    .add(DEFAULT_MARKET_WINDOW_DAYS, "day")
    .toDate();

  let nextRoundId: string;
  if (nextUpcoming) {
    // A rodada é promovida quando a anterior fecha, não no horário que
    // estava agendado para ela — a janela herdada pode não conter o "agora"
    // (ainda no futuro, ou já vencida). Nos dois casos o jogo entraria na
    // rodada nova com o mercado fechado e sem nenhuma forma de reabri-lo, já
    // que nada mais escreve nessas colunas. Só rebaseia quando precisa: uma
    // janela herdada que já está valendo é respeitada.
    const inheritedWindowIsOpen = isMarketOpen({
      opensAt: nextUpcoming.marketOpensAt,
      closesAt: nextUpcoming.marketClosesAt,
    });

    await tx
      .update(round)
      .set(
        inheritedWindowIsOpen
          ? { status: "active" }
          : {
              status: "active",
              marketOpensAt: opensAt,
              marketClosesAt: closesAt,
            },
      )
      .where(eq(round.id, nextUpcoming.id));
    nextRoundId = nextUpcoming.id;
  } else {
    // Sem nenhuma rodada `upcoming` esperando: cria a próxima na hora.
    const nextNumber = activeRound.number + 1;

    const [created] = await tx
      .insert(round)
      .values({
        number: nextNumber,
        name: `Rodada ${nextNumber}`,
        marketOpensAt: opensAt,
        marketClosesAt: closesAt,
        status: "active",
      })
      .returning({ id: round.id });
    nextRoundId = created.id;
  }

  return { closedRoundId: activeRound.id, nextRoundId };
}

async function runAsScript() {
  const result = await db.transaction((tx) => closeActiveRound(tx));

  if (!result) {
    console.log("Nenhuma rodada ativa — nada para fechar.");
    return;
  }
  console.log(
    `✓ Rodada fechada (${result.closedRoundId}). Rodada ativa agora: ${result.nextRoundId}.`,
  );
}

// Só executa ao ser chamado direto pelo `tsx` (`pnpm db:round:close`) — é o
// que permite `db/seed.ts` importar `closeActiveRound` sem disparar o script.
// `pathToFileURL` em vez de interpolar `file://`: o caminho do projeto pode
// ter espaço ou acento, que exigem percent-encoding para a comparação bater.
const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runAsScript()
    .catch((error) => {
      console.error("Falha ao fechar a rodada:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
