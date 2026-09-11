// `dotenv` como PRIMEIRO import: os imports de um módulo ES são avaliados
// em ordem, e `@/db` cria o pool a partir de `DATABASE_URL` já no import.
import "dotenv/config";

import { eq, sql } from "drizzle-orm";
import { pathToFileURL } from "node:url";

import { db, pool } from "@/db";
import { fantasyTeam, player } from "@/db/schema";
import {
  MAX_PATRIMONY_CENTS,
  STARTING_BUDGET_CENTS,
} from "@/lib/market/budget";
import { MAX_PRICE_CENTS, MIN_PRICE_CENTS } from "@/lib/scoring/pricing";
import {
  rebasePlayerPrices,
  refreshPlayerForm,
} from "@/lib/vlr/jobs/calculate-round";

/**
 * Rebase de manutenção do catálogo e dos saldos — `pnpm db:reprice` (Fase 3,
 * `.claude/plans/20-preco-dos-jogadores-e-orcamento.md`).
 *
 * ⚠️ **Primeira operação que altera dados de produção.** Faça backup do
 * banco (`pg_dump`) antes de rodar, e rode primeiro em desenvolvimento.
 *
 * Tudo dentro de **uma** `db.transaction` (CLAUDE.md: toda alteração de
 * saldo é transacional):
 *
 * 1. `refreshPlayerForm` — grava a forma de todo o catálogo.
 * 2. `rebasePlayerPrices` — leva todo preço direto ao alvo pela forma, sem
 *    passo (Decisão 9). Quem não tem forma vai para `DEBUT_PRICE_CENTS`.
 * 3. Para cada `fantasy_team`: `saldo = max(0, 300,0 − valor do elenco
 *    repreçado)`, nunca acima do teto de patrimônio. Ninguém perde jogador
 *    (Decisão 9) e ninguém fica com saldo negativo.
 *
 * **Idempotente**: rodar duas vezes dá o mesmo resultado — o alvo não
 * depende do preço anterior.
 */
export async function repriceCatalogAndBalances(): Promise<{
  playersRepriced: number;
  teamsZeroed: number;
  teamsTotal: number;
  minPriceCents: number;
  maxPriceCents: number;
}> {
  return db.transaction(async (tx) => {
    await refreshPlayerForm(tx);
    const { players: playersRepriced } = await rebasePlayerPrices(tx);

    const teams = await tx.query.fantasyTeam.findMany({
      with: { slots: { with: { player: true } } },
    });

    let teamsZeroed = 0;
    for (const team of teams) {
      const squadValueCents = team.slots.reduce(
        (total, slot) => total + (slot.player?.priceCents ?? 0),
        0,
      );
      const balanceCents = Math.max(
        0,
        Math.min(STARTING_BUDGET_CENTS - squadValueCents, MAX_PATRIMONY_CENTS),
      );
      if (balanceCents === 0 && squadValueCents > 0) teamsZeroed += 1;

      await tx
        .update(fantasyTeam)
        .set({ balanceCents })
        .where(eq(fantasyTeam.id, team.id));
    }

    const [range] = await tx
      .select({
        minPriceCents: sql<number>`min(${player.priceCents})::int`,
        maxPriceCents: sql<number>`max(${player.priceCents})::int`,
      })
      .from(player);

    return {
      playersRepriced,
      teamsZeroed,
      teamsTotal: teams.length,
      minPriceCents: range?.minPriceCents ?? MIN_PRICE_CENTS,
      maxPriceCents: range?.maxPriceCents ?? MAX_PRICE_CENTS,
    };
  });
}

async function runAsScript() {
  const result = await repriceCatalogAndBalances();
  console.log(
    `✓ ${result.playersRepriced} jogadores repreçados — faixa resultante: ` +
      `${(result.minPriceCents / 100).toFixed(1)} a ${(result.maxPriceCents / 100).toFixed(1)} créditos.`,
  );
  console.log(
    `✓ ${result.teamsZeroed} de ${result.teamsTotal} times tiveram o saldo zerado ` +
      `(elenco repreçado valia mais que o orçamento inicial).`,
  );
}

// Mesma checagem que `db/close-round.ts`: só executa ao ser chamado direto
// pelo `tsx` (`pnpm db:reprice`).
const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runAsScript()
    .catch((error) => {
      console.error("Falha ao repreçar o catálogo:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
