import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { NextRoundBrief } from "@/components/home/next-round-brief";
import type {
  NextRoundBrief as NextRoundBriefData,
  RoundMarketWindow,
} from "@/lib/home/types";

function window_(
  overrides: Partial<RoundMarketWindow> = {},
): RoundMarketWindow {
  return {
    event: "VCT 2026: Americas Stage 2",
    label: "Americas Stage 2",
    tier: "league",
    closesAt: new Date("2026-03-14T18:00:00Z"),
    countdown: "Mercado fecha em 36h 12m",
    firstMatch: {
      teamA: "LOUD",
      teamB: "MIBR",
      scheduledAt: new Date("2026-03-14T19:00:00Z"),
    },
    binding: true,
    ...overrides,
  };
}

const CHAMPIONS = window_({
  event: "Valorant Champions 2026",
  label: "Champions",
  tier: "champions",
  closesAt: new Date("2026-03-16T15:00:00Z"),
  countdown: "Mercado fecha em 84h 12m",
  firstMatch: {
    teamA: "FNATIC",
    teamB: "Team Heretics",
    scheduledAt: new Date("2026-03-16T16:00:00Z"),
  },
  binding: false,
});

function brief(
  overrides: Partial<NextRoundBriefData> = {},
): NextRoundBriefData {
  return {
    roundNumber: 4,
    marketOpensAt: new Date("2026-03-10T00:00:00Z"),
    marketClosesAt: new Date("2026-03-14T18:00:00Z"),
    marketCountdown: "Mercado fecha em 36h 12m",
    windows: [window_()],
    ...overrides,
  };
}

describe("NextRoundBrief", () => {
  it("estado vazio: nenhuma rodada agendada", () => {
    render(<NextRoundBrief nextRound={null} />);

    expect(
      screen.getByText("Nenhuma rodada agendada no momento."),
    ).toBeInTheDocument();
  });

  it("mostra o número da rodada e o estado do mercado vindo do servidor", () => {
    render(<NextRoundBrief nextRound={brief()} />);

    expect(screen.getByText("Sua rodada 4")).toBeInTheDocument();
    expect(screen.getByText("Mercado fecha em 36h 12m")).toBeInTheDocument();
  });

  it("diz de qual jogo o fechamento depende", () => {
    render(<NextRoundBrief nextRound={brief()} />);

    expect(screen.getByText(/Fecha 1h antes de/)).toBeInTheDocument();
    expect(screen.getByText("LOUD × MIBR")).toBeInTheDocument();
  });

  it("rodada sem partida marcada cai na janela da própria rodada", () => {
    render(<NextRoundBrief nextRound={brief({ windows: [] })} />);

    expect(screen.getByText("Mercado fecha em 36h 12m")).toBeInTheDocument();
    expect(
      screen.getByText("Nenhum jogo marcado para esta rodada ainda."),
    ).toBeInTheDocument();
  });

  it("um único campeonato não merece filtro", () => {
    render(<NextRoundBrief nextRound={brief()} />);

    expect(
      screen.queryByRole("group", { name: "Fechamento por campeonato" }),
    ).not.toBeInTheDocument();
  });

  it("abre pelo campeonato que fecha primeiro", () => {
    render(
      <NextRoundBrief nextRound={brief({ windows: [window_(), CHAMPIONS] })} />,
    );

    expect(screen.getByText("Mercado fecha em 36h 12m")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Americas Stage 2/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("escolher outro campeonato mostra o fechamento dele", async () => {
    const user = userEvent.setup();
    render(
      <NextRoundBrief nextRound={brief({ windows: [window_(), CHAMPIONS] })} />,
    );

    await user.click(screen.getByRole("button", { name: /Champions/ }));

    expect(screen.getByText("Mercado fecha em 84h 12m")).toBeInTheDocument();
    expect(screen.getByText("FNATIC × Team Heretics")).toBeInTheDocument();
  });

  it("num campeonato que não tranca, avisa qual tranca antes", async () => {
    const user = userEvent.setup();
    render(
      <NextRoundBrief nextRound={brief({ windows: [window_(), CHAMPIONS] })} />,
    );

    expect(
      screen.queryByText(/Sua escalação, porém, tranca antes/),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Champions/ }));

    expect(
      screen.getByText(/Sua escalação, porém, tranca antes/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Americas Stage 2 fecha em/)).toBeInTheDocument();
  });
});
