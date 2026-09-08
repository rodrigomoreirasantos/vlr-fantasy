import { eq } from "drizzle-orm";

import { db } from "@/db";
import { match, vlrEvent } from "@/db/schema";
import { SCOUT_VERSION, mapPoints } from "@/lib/scoring/scout";
import { logInfo } from "@/lib/vlr/http/log";
import { fetchHtml } from "@/lib/vlr/http/client";
import { diskRawStore, type RawStore } from "@/lib/vlr/http/raw-store";
import { upsertEvents } from "@/lib/vlr/persist/events";
import { upsertMatches } from "@/lib/vlr/persist/matches";
import { applyMatchPlayerRegions } from "@/lib/vlr/persist/player-regions";
import { resolvePlayer } from "@/lib/vlr/persist/players";
import { saveMatchStats, type MatchStatRow } from "@/lib/vlr/persist/stats";
import { upsertTeams } from "@/lib/vlr/persist/teams";
import { parseMatchDetail } from "@/lib/vlr/scrapers/match-detail";
import type { ScrapedMatchDetail } from "@/lib/vlr/schemas";

/** A URL que traz a série inteira — agregado e todos os mapas — numa requisição. */
export function matchDetailPath(vlrId: string): string {
  return `/${vlrId}/?game=all&tab=overview`;
}

/**
 * Baixa uma partida, salva o HTML e persiste as estatísticas por mapa.
 *
 * **Ordem obrigatória: `fetchHtml` → `store.put` → parse.** Se o parse
 * explodir — seletor que mudou, coluna nova — o arquivo já está no disco, e
 * `pnpm vlr:reprocess` conserta tudo sem uma requisição nova.
 */
export async function scrapeMatch(
  vlrId: string,
  store: RawStore = diskRawStore,
): Promise<{ matchId: string; mapCount: number; statCount: number }> {
  const { html } = await fetchHtml(matchDetailPath(vlrId));
  const rawHtmlPath = await store.put("match", vlrId, html);
  const detail = parseMatchDetail(html, vlrId);

  return persistMatchDetail(detail, rawHtmlPath);
}

/**
 * Reprocessa uma partida a partir do HTML já salvo — **sem rede**. É o que
 * torna barato corrigir um seletor ou mudar uma regra de scout: o HTML bruto
 * é o dado, tudo depois dele é recomputável.
 */
export async function reprocessMatch(
  vlrId: string,
  store: RawStore = diskRawStore,
): Promise<{ matchId: string; mapCount: number; statCount: number }> {
  const existing = await db.query.match.findFirst({
    where: eq(match.vlrId, vlrId),
  });
  if (!existing?.rawHtmlPath) {
    throw new Error(
      `Partida ${vlrId} não tem HTML salvo — rode \`pnpm vlr:work\` antes de reprocessar.`,
    );
  }

  const html = await store.get(existing.rawHtmlPath);
  return persistMatchDetail(
    parseMatchDetail(html, vlrId),
    existing.rawHtmlPath,
  );
}

/**
 * A escrita, numa única transação: evento, times, partida, jogadores e
 * estatísticas. Metade gravada seria pior que nada — um jogador criado sem a
 * partida a que pertence, ou uma partida marcada como extraída sem placar.
 */
async function persistMatchDetail(
  detail: ScrapedMatchDetail,
  rawHtmlPath: string,
): Promise<{ matchId: string; mapCount: number; statCount: number }> {
  return db.transaction(async (tx) => {
    const eventIds = detail.event.vlrId
      ? await upsertEvents(tx, [
          {
            vlrId: detail.event.vlrId,
            name: detail.event.name,
            status: "unknown",
            region: null,
            startsAt: null,
            endsAt: null,
          },
        ])
      : new Map<string, string>();

    await upsertTeams(
      tx,
      [detail.teamA, detail.teamB].flatMap((team) =>
        team.vlrId ? [{ vlrId: team.vlrId, name: team.name }] : [],
      ),
    );

    const matchIds = await upsertMatches(tx, [
      {
        vlrId: detail.vlrId,
        teamA: detail.teamA.name,
        teamB: detail.teamB.name,
        event: detail.event.name,
        eventId: detail.event.vlrId
          ? (eventIds.get(detail.event.vlrId) ?? null)
          : null,
        scheduledAt: detail.scheduledAt,
        status: detail.status,
        scoreA: detail.scoreA,
        scoreB: detail.scoreB,
        bestOf: detail.bestOf,
      },
    ]);
    const matchId = matchIds.get(detail.vlrId);
    if (!matchId) throw new Error(`Falha ao gravar a partida ${detail.vlrId}.`);

    // Um jogador aparece uma vez por mapa: resolver a identidade uma vez por
    // vlrId poupa duas consultas por mapa e mantém a resolução determinística.
    const playerIdByVlrId = new Map<string, string>();
    // Organização → ids dos jogadores dela nesta partida — a matéria-prima de
    // `applyMatchPlayerRegions`, montada no mesmo loop que já resolve a
    // identidade, sem consulta extra.
    const playersByOrganization = new Map<string, string[]>();
    const rows: MatchStatRow[] = [];

    for (const map of detail.maps) {
      for (const stat of map.players) {
        const teamName =
          stat.teamSide === "a" ? detail.teamA.name : detail.teamB.name;

        let playerId = playerIdByVlrId.get(stat.vlrId);
        if (!playerId) {
          const resolved = await resolvePlayer(tx, {
            vlrId: stat.vlrId,
            nickname: stat.nickname,
            team: teamName,
            country: stat.country,
            agents: stat.agents,
          });
          playerId = resolved.id;
          playerIdByVlrId.set(stat.vlrId, playerId);

          const organizationPlayers = playersByOrganization.get(teamName) ?? [];
          organizationPlayers.push(playerId);
          playersByOrganization.set(teamName, organizationPlayers);
        }

        rows.push({
          playerId,
          mapName: map.name,
          gameVlrId: map.gameVlrId,
          agent: stat.agents[0] ?? null,
          rating: stat.rating,
          acs: stat.acs,
          kills: stat.kills,
          deaths: stat.deaths,
          assists: stat.assists,
          kast: stat.kast,
          adr: stat.adr,
          headshotPct: stat.headshotPct,
          firstKills: stat.firstKills,
          firstDeaths: stat.firstDeaths,
          won: stat.won,
          fantasyPoints: mapPoints(stat),
          scoutVersion: SCOUT_VERSION,
        });
      }
    }

    await saveMatchStats(tx, {
      matchId,
      rows,
      rawHtmlPath,
      scrapedAt: new Date(),
      scoreA: detail.scoreA,
      scoreB: detail.scoreB,
      bestOf: detail.bestOf,
      status: detail.status,
    });

    // A bandeira do evento (`vlr_event.region`) recém-upsertado — `upsertEvents`
    // não a devolve, então é uma segunda leitura pontual, dentro da mesma
    // transação. Ordem obrigatória: resolvePlayer → saveMatchStats →
    // applyMatchPlayerRegions, para um jogador novo nunca ficar um instante
    // fora de todas as abas de escalação.
    const eventId = detail.event.vlrId
      ? (eventIds.get(detail.event.vlrId) ?? null)
      : null;
    const eventRow = eventId
      ? await tx.query.vlrEvent.findFirst({ where: eq(vlrEvent.id, eventId) })
      : null;

    await applyMatchPlayerRegions(tx, {
      source: {
        event: detail.event.name,
        regionCode: eventRow?.region ?? null,
        scheduledAt: detail.scheduledAt,
      },
      playersByOrganization,
    });

    logInfo("vlr.match.persisted", {
      vlrId: detail.vlrId,
      matchId,
      maps: detail.maps.length,
      stats: rows.length,
      players: playerIdByVlrId.size,
    });

    return { matchId, mapCount: detail.maps.length, statCount: rows.length };
  });
}
