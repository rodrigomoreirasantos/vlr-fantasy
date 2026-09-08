import { fetchHtml } from "@/lib/vlr/http/client";
import { errorMessage, logError, logInfo } from "@/lib/vlr/http/log";
import { countNeedsReview } from "@/lib/vlr/jobs/backfill";
import { countScrapedMatches } from "@/lib/vlr/jobs/calculate-round";
import { countPlayersOutOfRegion } from "@/lib/vlr/jobs/sync-player-regions";
import { parseEventList } from "@/lib/vlr/scrapers/event-list";
import { parseMatchDetail } from "@/lib/vlr/scrapers/match-detail";
import { parseMatchList } from "@/lib/vlr/scrapers/match-list";
import { parseTeamRoster } from "@/lib/vlr/scrapers/team-roster";

export type DoctorCheck = {
  name: string;
  path: string;
  status: "ok" | "empty" | "error";
  found: number;
  error?: string;
};

/**
 * O job que impede descobrir o parser quebrado por reclamação de usuário:
 * roda **os mesmos parsers dos testes** contra a rede e relata, por página,
 * `ok` / `0 resultados` / erro.
 *
 * As fixtures provam que o parser entende o HTML de ontem; o doctor prova que
 * ele ainda entende o de hoje. São as duas metades da mesma garantia.
 */
export async function runDoctor(): Promise<{
  checks: DoctorCheck[];
  healthy: boolean;
  needsReview: number;
  scrapedMatches: number;
  playersOutOfRegion: number;
}> {
  const checks: DoctorCheck[] = [];

  checks.push(
    await check(
      "match-list",
      "/matches",
      (html, path) => parseMatchList(html, path).length,
    ),
  );
  checks.push(
    await check(
      "match-results",
      "/matches/results",
      (html, path) => parseMatchList(html, path).length,
    ),
  );
  checks.push(
    await check(
      "event-list",
      "/events",
      (html, path) => parseEventList(html, path).length,
    ),
  );

  // A partida a conferir sai da própria lista de resultados: uma página fixa
  // sairia do ar e o doctor passaria a falhar por um motivo que não é o dele.
  const probe = await pickFinishedMatch();
  if (probe) {
    checks.push(
      await check(
        "match-detail",
        `/${probe}/?game=all&tab=overview`,
        (html) => {
          const detail = parseMatchDetail(html, probe);
          return detail.maps.reduce(
            (total, map) => total + map.players.length,
            0,
          );
        },
      ),
    );
  }

  checks.push(
    await check(
      "team-roster",
      "/team/17037/glacial-guardians",
      (html) => parseTeamRoster(html, "17037").players.length,
    ),
  );

  const healthy = checks.every((row) => row.status === "ok");
  const needsReview = await countNeedsReview();
  const scrapedMatches = await countScrapedMatches();
  // Quantos jogadores `active` ainda estão fora das 5 abas de escalação —
  // `.claude/plans/10-time-por-regiao.md`. Não entra em `healthy`: um
  // catálogo novo começa assim, e cai conforme o scrap acumula histórico.
  const playersOutOfRegion = await countPlayersOutOfRegion();

  logInfo("vlr.doctor.finished", {
    healthy,
    needsReview,
    scrapedMatches,
    playersOutOfRegion,
  });
  return { checks, healthy, needsReview, scrapedMatches, playersOutOfRegion };
}

async function check(
  name: string,
  path: string,
  run: (html: string, path: string) => number,
): Promise<DoctorCheck> {
  try {
    const { html } = await fetchHtml(path);
    const found = run(html, path);
    const status = found > 0 ? "ok" : "empty";
    if (status === "empty") logError("vlr.doctor.empty", { name, path });
    return { name, path, status, found };
  } catch (error) {
    logError("vlr.doctor.error", { name, path, error: errorMessage(error) });
    return {
      name,
      path,
      status: "error",
      found: 0,
      error: errorMessage(error),
    };
  }
}

/** Um `vlrId` de partida encerrada, tirado da primeira página de resultados. */
async function pickFinishedMatch(): Promise<string | null> {
  try {
    const { html } = await fetchHtml("/matches/results");
    const items = parseMatchList(html, "/matches/results");
    return items.find((item) => item.status === "finished")?.vlrId ?? null;
  } catch {
    return null;
  }
}
