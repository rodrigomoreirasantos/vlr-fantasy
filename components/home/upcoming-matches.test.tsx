import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { UpcomingMatches } from "@/components/home/upcoming-matches";
import { formatMarketClose, nextMarketClose } from "@/lib/market/window";
import type { RoundMatch } from "@/lib/round/types";

const NOW = new Date("2026-09-03T12:00:00Z");

function match(overrides: Partial<RoundMatch> = {}): RoundMatch {
  return {
    id: "match-1",
    teamA: "NRG",
    teamB: "100 Thieves",
    event: "VCT 2026: Americas Stage 2",
    scheduledAt: new Date("2026-09-04T17:00:00Z"),
    status: "upcoming",
    scoreA: null,
    scoreB: null,
    ...overrides,
  };
}

function renderPanel(
  matches: RoundMatch[],
  myOrganizations: readonly string[] = [],
) {
  const marketClosesAt = nextMarketClose(matches, NOW);

  return render(
    <UpcomingMatches
      upcoming={{
        matches,
        myOrganizations,
        marketClosesAt,
        marketCountdown: marketClosesAt
          ? formatMarketClose(marketClosesAt, NOW)
          : null,
      }}
      now={NOW}
    />,
  );
}

describe("UpcomingMatches", () => {
  it("estado vazio: nenhum jogo confirmado", () => {
    renderPanel([]);

    expect(
      screen.getByText("Nenhum jogo confirmado no circuito agora."),
    ).toBeInTheDocument();
  });

  it("lista os jogos com times, campeonato e horário", () => {
    renderPanel([match()]);

    expect(screen.getByText(/NRG/)).toBeInTheDocument();
    expect(screen.getByText("VCT 2026: Americas Stage 2")).toBeInTheDocument();
    expect(screen.getByText("17:00")).toBeInTheDocument();
  });

  it("agrupa por dia, com 'Hoje' e 'Amanhã' por nome", () => {
    renderPanel([
      match({ id: "a", scheduledAt: new Date("2026-09-03T21:00:00Z") }),
      match({ id: "b", scheduledAt: new Date("2026-09-04T08:00:00Z") }),
    ]);

    expect(
      screen.getByRole("heading", { name: "Hoje", level: 3 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Amanhã", level: 3 }),
    ).toBeInTheDocument();
  });

  it("conta os jogos de cada dia, no singular e no plural", () => {
    renderPanel([
      match({ id: "a", scheduledAt: new Date("2026-09-03T21:00:00Z") }),
      match({ id: "b", scheduledAt: new Date("2026-09-03T23:30:00Z") }),
      match({ id: "c", scheduledAt: new Date("2026-09-04T08:00:00Z") }),
    ]);

    expect(screen.getByText("2 jogos")).toBeInTheDocument();
    expect(screen.getByText("1 jogo")).toBeInTheDocument();
  });

  it("marca como 'Próximo' apenas o primeiro jogo a começar", () => {
    renderPanel([
      match({ id: "a", scheduledAt: new Date("2026-09-03T21:00:00Z") }),
      match({ id: "b", scheduledAt: new Date("2026-09-04T08:00:00Z") }),
    ]);

    expect(screen.getAllByText("Próximo")).toHaveLength(1);
  });

  it("um jogo já começado não recebe o selo 'Próximo'", () => {
    renderPanel([match({ scheduledAt: new Date("2026-09-03T10:00:00Z") })]);

    expect(screen.queryByText("Próximo")).not.toBeInTheDocument();
  });

  it("destaca o jogo que envolve um dos seus 5", () => {
    renderPanel(
      [
        match({ id: "a", teamA: "NRG", teamB: "100 Thieves" }),
        match({
          id: "b",
          teamA: "LOUD",
          teamB: "G2 Esports",
          scheduledAt: new Date("2026-09-04T20:00:00Z"),
        }),
      ],
      ["LOUD"],
    );

    expect(screen.getAllByText("Seu jogador")).toHaveLength(1);
  });

  it("um jogo ao vivo é anunciado como tal", () => {
    renderPanel([match({ status: "live" })]);

    expect(screen.getByText("Ao vivo")).toBeInTheDocument();
  });

  it("o horário é uma data legível por máquina", () => {
    renderPanel([match()]);

    // O primeiro `<time>` da linha é o kickoff; o segundo, o fechamento.
    const [kickoff, market] = screen
      .getByRole("listitem")
      .querySelectorAll("time");
    expect(kickoff).toHaveAttribute(
      "dateTime",
      new Date("2026-09-04T17:00:00Z").toISOString(),
    );
    expect(market).toHaveAttribute(
      "dateTime",
      new Date("2026-09-04T16:00:00Z").toISOString(),
    );
  });

  it("cada linha diz quando o mercado dela fecha", () => {
    renderPanel([match()]);

    // Kickoff 17:00Z; o mercado do dia fecha uma hora antes.
    expect(screen.getByText("Mercado fecha 16:00")).toBeInTheDocument();
  });

  it("jogos do mesmo campeonato no mesmo dia fecham juntos", () => {
    renderPanel([
      match({ id: "a", scheduledAt: new Date("2026-09-04T17:00:00Z") }),
      match({ id: "b", scheduledAt: new Date("2026-09-04T20:00:00Z") }),
    ]);

    // Os dois às 16:00 — uma hora antes do PRIMEIRO jogo do dia.
    expect(screen.getAllByText("Mercado fecha 16:00")).toHaveLength(2);
    expect(screen.queryByText("Mercado fecha 19:00")).not.toBeInTheDocument();
  });

  it("o countdown do mercado abre a lista", () => {
    renderPanel([match()]);

    // NOW é 03/09 12:00Z; o mercado fecha 04/09 16:00Z.
    expect(screen.getByText("Mercado fecha em 28h 0m")).toBeInTheDocument();
  });

  it("o countdown segue o campeonato escolhido", async () => {
    const user = userEvent.setup();
    renderPanel([
      match({ id: "a", event: "VCT 2026: Americas Stage 2" }),
      match({
        id: "b",
        event: "Valorant Champions 2026",
        scheduledAt: new Date("2026-09-05T17:00:00Z"),
      }),
    ]);

    await user.click(screen.getByRole("button", { name: /Champions/ }));

    expect(screen.getByText("Mercado fecha em 52h 0m")).toBeInTheDocument();
  });

  it("cada dia lista suas próprias partidas", () => {
    renderPanel([
      match({
        id: "a",
        teamA: "NRG",
        teamB: "100 Thieves",
        scheduledAt: new Date("2026-09-03T21:00:00Z"),
      }),
      match({
        id: "b",
        teamA: "LOUD",
        teamB: "G2 Esports",
        scheduledAt: new Date("2026-09-04T08:00:00Z"),
      }),
    ]);

    const hoje = screen.getByRole("heading", { name: "Hoje" }).parentElement
      ?.parentElement as HTMLElement;
    expect(within(hoje).getByText(/NRG/)).toBeInTheDocument();
    expect(within(hoje).queryByText(/LOUD/)).not.toBeInTheDocument();
  });

  it("um único campeonato na grade não merece filtro", () => {
    renderPanel([match({ id: "a" }), match({ id: "b" })]);

    expect(
      screen.queryByRole("group", { name: "Filtrar por campeonato" }),
    ).not.toBeInTheDocument();
  });

  it("oferece os campeonatos com Champions e Masters à frente", () => {
    renderPanel([
      match({ id: "a", event: "VCT 2026: Americas Stage 2" }),
      match({ id: "b", event: "VCT 2026: Masters Toronto" }),
      match({ id: "c", event: "Valorant Champions 2026" }),
    ]);

    const filters = screen.getByRole("group", {
      name: "Filtrar por campeonato",
    });
    const labels = within(filters)
      .getAllByRole("button")
      .map((button) => button.textContent);

    expect(labels).toEqual([
      "Todos3",
      "Champions1",
      "Masters Toronto1",
      "Americas Stage 21",
    ]);
  });

  it("escolher um campeonato deixa só os jogos dele na lista", async () => {
    const user = userEvent.setup();
    renderPanel([
      match({ id: "a", teamA: "NRG", event: "VCT 2026: Americas Stage 2" }),
      match({
        id: "b",
        teamA: "FNATIC",
        teamB: "Team Heretics",
        event: "Valorant Champions 2026",
      }),
    ]);

    await user.click(screen.getByRole("button", { name: /Champions/ }));

    expect(screen.getByText(/FNATIC/)).toBeInTheDocument();
    expect(screen.queryByText(/NRG/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Champions/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("'Todos' devolve a grade inteira", async () => {
    const user = userEvent.setup();
    renderPanel([
      match({ id: "a", teamA: "NRG", event: "VCT 2026: Americas Stage 2" }),
      match({
        id: "b",
        teamA: "FNATIC",
        teamB: "Team Heretics",
        event: "Valorant Champions 2026",
      }),
    ]);

    await user.click(screen.getByRole("button", { name: /Champions/ }));
    await user.click(screen.getByRole("button", { name: /Todos/ }));

    expect(screen.getByText(/NRG/)).toBeInTheDocument();
    expect(screen.getByText(/FNATIC/)).toBeInTheDocument();
  });

  it("uma grade longa é cortada, e o resto fica a um clique", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 15 }, (_, index) =>
      match({
        id: `m${index}`,
        teamA: `Time ${index}`,
        scheduledAt: new Date(
          new Date("2026-09-04T17:00:00Z").getTime() + index * 3_600_000,
        ),
      }),
    );
    renderPanel(many);

    expect(screen.queryByText(/Time 14/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver mais 3 jogos" }));

    expect(screen.getByText(/Time 14/)).toBeInTheDocument();
  });
});
