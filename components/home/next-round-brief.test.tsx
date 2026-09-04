import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { NextRoundBrief } from "@/components/home/next-round-brief";
import type { NextRoundBrief as NextRoundBriefData } from "@/lib/home/types";
import type { RoundMatch } from "@/lib/round/types";

const NOW = new Date("2026-09-03T12:00:00Z");
/** O mercado deste jogo fecha às 19:00Z — uma hora antes. */
const AMERICAS_KICKOFF = new Date("2026-09-03T20:00:00Z");
/** Mesmo campeonato, mesmo dia: fecha junto com o de cima, não às 21:00Z. */
const AMERICAS_SEGUNDO_JOGO = new Date("2026-09-03T22:00:00Z");
const CHAMPIONS_KICKOFF = new Date("2026-09-04T16:00:00Z");

function match(overrides: Partial<RoundMatch> = {}): RoundMatch {
  return {
    id: "americas",
    teamA: "SENTINELS",
    teamB: "NRG",
    event: "VCT 2026: Americas Stage 2",
    scheduledAt: AMERICAS_KICKOFF,
    status: "upcoming",
    scoreA: null,
    scoreB: null,
    ...overrides,
  };
}

const CHAMPIONS = match({
  id: "champions",
  teamA: "FNATIC",
  teamB: "Team Heretics",
  event: "Valorant Champions 2026",
  scheduledAt: CHAMPIONS_KICKOFF,
});

function brief(
  overrides: Partial<NextRoundBriefData> = {},
): NextRoundBriefData {
  return {
    roundNumber: 4,
    marketOpensAt: new Date("2026-08-31T00:00:00Z"),
    marketClosesAt: new Date("2026-09-03T19:00:00Z"),
    marketCountdown: "Mercado fecha em 7h 0m",
    matches: [match()],
    myOrganizations: [],
    ...overrides,
  };
}

function renderPanel(overrides: Partial<NextRoundBriefData> = {}) {
  return render(<NextRoundBrief nextRound={brief(overrides)} now={NOW} />);
}

describe("NextRoundBrief", () => {
  it("estado vazio: nenhuma rodada agendada", () => {
    render(<NextRoundBrief nextRound={null} now={NOW} />);

    expect(
      screen.getByText("Nenhuma rodada agendada no momento."),
    ).toBeInTheDocument();
  });

  it("mostra o número da rodada e o estado do mercado vindo do servidor", () => {
    renderPanel();

    expect(screen.getByText("Sua rodada 4")).toBeInTheDocument();
    expect(screen.getByText("Mercado fecha em 7h 0m")).toBeInTheDocument();
  });

  it("cada linha mostra a hora do mercado, não a do kickoff", () => {
    const { container } = renderPanel();

    // Kickoff 20:00Z; o mercado dele fecha às 19:00Z.
    expect(screen.getByText("19:00")).toBeInTheDocument();
    expect(screen.queryByText("20:00")).not.toBeInTheDocument();
    expect(container.querySelector("time")).toHaveAttribute(
      "dateTime",
      new Date("2026-09-03T19:00:00Z").toISOString(),
    );
  });

  it("lista o confronto e o campeonato de cada jogo", () => {
    renderPanel();

    expect(screen.getByText(/SENTINELS/)).toBeInTheDocument();
    expect(screen.getByText("VCT 2026: Americas Stage 2")).toBeInTheDocument();
  });

  it("sem jogo marcado, não inventa fechamento nenhum", () => {
    renderPanel({ matches: [], marketClosesAt: null, marketCountdown: null });

    expect(
      screen.getByText("Mercado aberto — nenhum jogo marcado para fechá-lo."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nenhum jogo marcado para esta rodada ainda."),
    ).toBeInTheDocument();
  });

  it("dois jogos do mesmo campeonato no mesmo dia fecham no mesmo horário", () => {
    renderPanel({
      matches: [
        match(),
        match({ id: "americas-2", scheduledAt: AMERICAS_SEGUNDO_JOGO }),
      ],
    });

    // Os dois às 19:00Z — uma hora antes do PRIMEIRO jogo do dia, não de cada um.
    expect(screen.getAllByText("19:00")).toHaveLength(2);
    expect(screen.queryByText("21:00")).not.toBeInTheDocument();
  });

  it("um único campeonato não merece filtro", () => {
    renderPanel();

    expect(
      screen.queryByRole("group", { name: "Filtrar por campeonato" }),
    ).not.toBeInTheDocument();
  });

  it("filtra a grade por campeonato, como em 'Próximos jogos'", async () => {
    const user = userEvent.setup();
    renderPanel({ matches: [match(), CHAMPIONS] });

    await user.click(screen.getByRole("button", { name: /Champions/ }));

    expect(screen.getByText(/FNATIC/)).toBeInTheDocument();
    expect(screen.queryByText(/SENTINELS/)).not.toBeInTheDocument();
  });

  it("o countdown segue o campeonato escolhido", async () => {
    const user = userEvent.setup();
    renderPanel({ matches: [match(), CHAMPIONS] });

    await user.click(screen.getByRole("button", { name: /Champions/ }));

    // Champions começa 04/09 16:00Z: mercado às 15:00Z, 27h depois de NOW.
    expect(screen.getByText("Mercado fecha em 27h 0m")).toBeInTheDocument();
  });

  it("cada campeonato tranca no seu horário, sem herdar o do outro", async () => {
    const user = userEvent.setup();
    renderPanel({ matches: [match(), CHAMPIONS] });

    // Americas fecha hoje 19:00Z; Champions, amanhã 15:00Z.
    expect(screen.getByText("Mercado fecha em 7h 0m")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Champions/ }));

    expect(screen.getByText("Mercado fecha em 27h 0m")).toBeInTheDocument();
    expect(
      screen.queryByText("Mercado fecha em 7h 0m"),
    ).not.toBeInTheDocument();
  });

  it("destaca a partida de um dos seus 5", () => {
    renderPanel({ myOrganizations: ["NRG"] });

    const row = screen.getByRole("listitem");
    expect(within(row).getByText("Seu jogador")).toBeInTheDocument();
  });
});
