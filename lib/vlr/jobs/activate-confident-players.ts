import { eq } from "drizzle-orm";

import { db } from "@/db";
import { player } from "@/db/schema";
import { logInfo } from "@/lib/vlr/http/log";
import { agentToRole } from "@/lib/vlr/normalize/agent-role";

/**
 * Sufixo que `resolvePlayer` (`lib/vlr/persist/players.ts`) usa quando dois
 * vlrIds colidem no mesmo nickname — `"nick (vlrId)"`. Uma linha com esse
 * formato nunca é confiável, mesmo que o agente bata com a função: a
 * resolução de identidade não bateu, é exatamente o caso que continua
 * exigindo um humano.
 */
const COLLISION_SUFFIX = /\s\([^()]+\)$/;

export type ActivateConfidentPlayersResult = {
  reviewed: number;
  activated: number;
};

/**
 * Limpeza pontual do lote represado antes da regra de confiança em
 * `resolvePlayer` (`.claude/plans/11-mercado-sempre-atualizado.md` — só
 * ativa quem já tinha identidade confiável, mas que a regra antiga marcava
 * `needsReview` para **todo** jogador novo, sem distinção.
 *
 * O mesmo critério de confiança de `createPlayer`: vlrId presente, agente
 * reconhecido batendo com a função gravada (nunca caiu no `FALLBACK_ROLE`) e
 * sem sufixo de colisão de nickname. Idempotente — seguro rodar mais de uma
 * vez, e continua servindo de rede de segurança se algum jogador legitimamente
 * ambíguo ficar parado por engano.
 */
export async function activateConfidentPlayers(): Promise<ActivateConfidentPlayersResult> {
  const pending = await db.query.player.findMany({
    where: eq(player.needsReview, true),
  });

  let activated = 0;
  for (const row of pending) {
    const confident =
      row.vlrId !== null &&
      !COLLISION_SUFFIX.test(row.nickname) &&
      agentToRole(row.agent) === row.role;
    if (!confident) continue;

    await db
      .update(player)
      .set({ active: true, needsReview: false })
      .where(eq(player.id, row.id));
    activated += 1;
  }

  logInfo("vlr.activate_confident_players.finished", {
    reviewed: pending.length,
    activated,
  });

  return { reviewed: pending.length, activated };
}
