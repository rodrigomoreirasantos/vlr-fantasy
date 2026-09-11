import { and, eq, isNull } from "drizzle-orm";

import { player } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db/errors";
import { DEBUT_PRICE_CENTS } from "@/lib/scoring/pricing";
import type { Querier } from "@/lib/team/queries";
import { PLAYER_ROLES, type PlayerRole } from "@/lib/team/types";
import { logWarn } from "@/lib/vlr/http/log";
import { primaryRole } from "@/lib/vlr/normalize/agent-role";

export type ScrapedIdentity = {
  vlrId: string;
  nickname: string;
  team: string;
  realName?: string | null;
  country?: string | null;
  agents: readonly string[];
};

export type ResolvedPlayer = {
  id: string;
  created: boolean;
  needsReview: boolean;
};

/**
 * Função de quem chegou sem nenhum agente conhecido. A escolha é arbitrária
 * de propósito — quem cai aqui sai com `needsReview`, e é um humano que
 * decide. O importante é a coluna ser `NOT NULL` sem inventar um enum novo.
 */
const FALLBACK_ROLE: PlayerRole = PLAYER_ROLES[0];

/**
 * A resolução de identidade, em três degraus. O achado que a simplificou: o
 * **vlrId do jogador está no scoreboard** (`/player/49871/yuno`), então o
 * caminho feliz é chave natural, não heurística de nickname.
 *
 * 1. `player.vlrId` bate → é ele. Atualiza nickname, time, país.
 * 2. Não bate, mas há um `nickname` igual **sem** `vlrId` → **adota** o
 *    registro do seed: é o mesmo jogador, agora com id externo.
 * 3. Nada bate → cria com `needsReview` e `active: false` — fica fora do
 *    mercado até alguém olhar.
 *
 * **Nunca duplica jogador em silêncio.** Uma colisão de nickname entre vlrIds
 * diferentes é capturada por `isUniqueViolation` e vira um registro sufixado
 * e sinalizado, não um erro que derruba o job da partida inteira.
 */
export async function resolvePlayer(
  tx: Querier,
  scraped: ScrapedIdentity,
): Promise<ResolvedPlayer> {
  const byVlrId = await tx.query.player.findFirst({
    where: eq(player.vlrId, scraped.vlrId),
  });
  if (byVlrId) {
    // O nickname vai num savepoint à parte: um jogador que troca de nick no
    // vlr para um nick já ocupado violaria `player_nickname_uidx`, e sem o
    // savepoint isso aborta a transação da partida inteira por causa de um
    // campo cosmético.
    const renamed =
      byVlrId.nickname === scraped.nickname ||
      (await inSavepoint(tx, (sp) =>
        sp
          .update(player)
          .set({ nickname: scraped.nickname })
          .where(eq(player.id, byVlrId.id)),
      ));

    if (!renamed) {
      logWarn("vlr.player.rename_collision", {
        vlrId: scraped.vlrId,
        from: byVlrId.nickname,
        to: scraped.nickname,
      });
    }

    await tx
      .update(player)
      .set({
        team: scraped.team,
        realName: scraped.realName ?? byVlrId.realName,
        country: scraped.country ?? byVlrId.country,
      })
      .where(eq(player.id, byVlrId.id));
    return { id: byVlrId.id, created: false, needsReview: byVlrId.needsReview };
  }

  const byNickname = await tx.query.player.findFirst({
    where: and(eq(player.nickname, scraped.nickname), isNull(player.vlrId)),
  });
  if (byNickname) {
    // Adoção: o registro fictício do seed vira o jogador real, preservando
    // preço, pontuação e — o que mais importa — as escalações que o contêm.
    await tx
      .update(player)
      .set({
        vlrId: scraped.vlrId,
        team: scraped.team,
        realName: scraped.realName ?? byNickname.realName,
        country: scraped.country ?? byNickname.country,
      })
      .where(eq(player.id, byNickname.id));
    return {
      id: byNickname.id,
      created: false,
      needsReview: byNickname.needsReview,
    };
  }

  return createPlayer(tx, scraped);
}

/**
 * Roda uma escrita dentro de um **SAVEPOINT** (é no que o Drizzle traduz uma
 * transação aninhada), devolvendo `false` se ela violou um `UNIQUE`.
 *
 * Sem isto o `try/catch` seria inútil: no Postgres, **qualquer** erro aborta a
 * transação inteira, e todo comando seguinte falha com `25P02 current
 * transaction is aborted`. Como `resolvePlayer` só roda dentro da transação da
 * partida, uma colisão de nickname derrubaria a partida toda — o oposto do que
 * o tratamento pretende. Verificado contra o Postgres, não deduzido.
 */
/**
 * Exportada para `applyRoster` (lib/vlr/persist/rosters.ts) reusar a mesma
 * proteção contra colisão de apelido — a resolução por elenco também renomeia
 * jogador, e não pode derrubar o lote inteiro por um `player_nickname_uidx`.
 */
export async function inSavepoint(
  tx: Querier,
  write: (sp: Querier) => Promise<unknown>,
): Promise<boolean> {
  try {
    await tx.transaction(async (sp) => {
      await write(sp);
    });
    return true;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return false;
  }
}

async function createPlayer(
  tx: Querier,
  scraped: ScrapedIdentity,
): Promise<ResolvedPlayer> {
  const role = primaryRole(scraped.agents);
  // Confiança alta: a função veio de um agente que a gente conhece de
  // verdade, não do `FALLBACK_ROLE`. É o único caso em que dá pra publicar
  // sem um humano olhar — o scoreboard trouxe vlrId, time e agente, e o
  // agente resolveu função sozinho. Quem cai no fallback (agente
  // desconhecido) continua nascendo fora do mercado.
  const confident = role !== null;
  const values = {
    vlrId: scraped.vlrId,
    nickname: scraped.nickname,
    team: scraped.team,
    // `agent` é `NOT NULL` e a UI o exibe: string vazia seria um buraco na
    // tela. Uma linha de scoreboard sem `<img>` de agente é rara, mas existe.
    agent: scraped.agents[0] ?? "Desconhecido",
    role: role ?? FALLBACK_ROLE,
    realName: scraped.realName ?? null,
    country: scraped.country ?? null,
    // Preço de estreia: vale até existir forma (`formPoints`). O
    // `refreshPlayerForm` do fim do lote da fila (`lib/vlr/jobs/work.ts`) já
    // produz essa forma — não depende de alguém rodar `pnpm vlr:backfill`
    // de novo (fato 16, plano 20).
    priceCents: DEBUT_PRICE_CENTS,
    active: confident,
    needsReview: !confident,
  };

  let createdId: string | null = null;
  const inserted = await inSavepoint(tx, async (sp) => {
    const [row] = await sp
      .insert(player)
      .values(values)
      .returning({ id: player.id });
    createdId = row.id;
  });

  if (inserted && createdId) {
    return { id: createdId, created: true, needsReview: !confident };
  }

  // Dois vlrIds diferentes com o mesmo nickname. A resolução de identidade
  // não bateu — sinaliza sempre, mesmo quando o agente era confiável: o
  // sufixo mantém os dois no banco, fora do mercado até um humano olhar, em
  // vez de perder um deles ou derrubar a partida.
  {
    const nickname = `${scraped.nickname} (${scraped.vlrId})`;
    logWarn("vlr.player.nickname_collision", {
      vlrId: scraped.vlrId,
      nickname: scraped.nickname,
      renamedTo: nickname,
    });
    const [created] = await tx
      .insert(player)
      .values({ ...values, nickname, active: false, needsReview: true })
      .returning({ id: player.id });
    return { id: created.id, created: true, needsReview: true };
  }
}
