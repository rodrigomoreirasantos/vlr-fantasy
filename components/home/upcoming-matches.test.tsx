import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { UpcomingMatches } from "@/components/home/upcoming-matches";
import { TimezoneProvider } from "@/components/layout/timezone";
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
  tz = "America/Sao_Paulo",
) {
  return render(
    <TimezoneProvider tz={tz}>
      <UpcomingMatches upcoming={{ matches, myOrganizations }} now={NOW} />
    </TimezoneProvider>,
  );
}

describe("UpcomingMatches", () => {
  it("estado vazio: nenhum jogo confirmado", () => {
    renderPanel([]);

    expect(
      screen.getByText("Nenhum jogo confirmado no circuito agora."),
    ).toBeInTheDocument();
  });

  it("estado vazio: o painel é o alvo 'proximos-jogos' do tour guiado", () => {
    const { container } = renderPanel([]);

    expect(
      container.querySelector('[data-tour="proximos-jogos"]'),
    ).not.toBeNull();
  });

  it("com jogos: só o MarketCell da próxima partida é o alvo 'fechamento-mercado'", () => {
    const { container } = renderPanel([
      match({ id: "a", scheduledAt: new Date("2026-09-03T21:00:00Z") }),
      match({ id: "b", scheduledAt: new Date("2026-09-04T08:00:00Z") }),
    ]);

    expect(
      container.querySelectorAll('[data-tour="fechamento-mercado"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-tour="proximos-jogos"]'),
    ).not.toBeNull();
  });

  it("abrindo em 'Internacional', o alvo do tour é o próximo jogo da lista na tela", () => {
    const { container } = renderPanel([
      // O próximo do circuito é de liga — fica fora da lista filtrada.
      match({
        id: "liga",
        teamA: "NRG",
        event: "VCT 2026: Americas Stage 2",
        scheduledAt: new Date("2026-09-03T21:00:00Z"),
      }),
      match({
        id: "champions",
        teamA: "FNATIC",
        teamB: "LOUD",
        event: "Valorant Champions 2026",
        scheduledAt: new Date("2026-09-04T08:00:00Z"),
      }),
    ]);

    const targets = container.querySelectorAll(
      '[data-tour="fechamento-mercado"]',
    );
    expect(targets).toHaveLength(1);
    expect(targets[0].closest("li")).toHaveTextContent(/FNATIC/);
  });

  it("lista os jogos com times, região, campeonato e horário", () => {
    renderPanel([match()]);

    // Escopado na linha do jogo: "Americas" também aparece no chip de
    // filtro agora que as quatro ligas sempre são oferecidas.
    const row = screen.getByRole("listitem");
    expect(within(row).getByText(/NRG/)).toBeInTheDocument();
    // 17:00Z = 14:00 em America/Sao_Paulo (UTC-3), o fuso do jogo.
    expect(within(row).getByText("14:00")).toBeInTheDocument();
    // A origem do jogo, evidente: a liga em destaque e o nome curto embaixo.
    expect(within(row).getByText("Americas")).toBeInTheDocument();
    expect(within(row).getByText("Americas Stage 2")).toBeInTheDocument();
  });

  it("o nome longo do campeonato continua ao alcance, no title", () => {
    renderPanel([match()]);

    expect(screen.getByText("Americas Stage 2")).toHaveAttribute(
      "title",
      "VCT 2026: Americas Stage 2",
    );
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

    // Kickoff 17:00Z; o mercado do dia fecha uma hora antes (16:00Z), que é
    // 13:00 em America/Sao_Paulo (UTC-3), o fuso do jogo.
    expect(screen.getByText("Mercado fecha 13:00")).toBeInTheDocument();
  });

  it("jogos do mesmo campeonato no mesmo dia fecham juntos", () => {
    renderPanel([
      match({ id: "a", scheduledAt: new Date("2026-09-04T17:00:00Z") }),
      match({ id: "b", scheduledAt: new Date("2026-09-04T20:00:00Z") }),
    ]);

    // Os dois às 16:00Z (13:00 em Sao_Paulo) — uma hora antes do PRIMEIRO
    // jogo do dia.
    expect(screen.getAllByText("Mercado fecha 13:00")).toHaveLength(2);
    expect(screen.queryByText("Mercado fecha 16:00")).not.toBeInTheDocument();
  });

  it("com jogo internacional no calendário, abre com 'Internacional' selecionado", () => {
    renderPanel([
      match({ id: "a", teamA: "NRG", event: "VCT 2026: Americas Stage 2" }),
      match({
        id: "b",
        teamA: "FNATIC",
        teamB: "LOUD",
        event: "Valorant Champions 2026",
      }),
    ]);

    expect(
      screen.getByRole("button", { name: /^Internacional/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Todos/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // A grade já vem filtrada: só o jogo internacional, com o relógio dele.
    expect(screen.getByText(/FNATIC/)).toBeInTheDocument();
    expect(screen.queryByText(/NRG/)).not.toBeInTheDocument();
    expect(screen.getByText(/Mercado fecha em/)).toBeInTheDocument();
  });

  it("sem jogo internacional, abre em 'Todos' — nunca numa grade vazia", () => {
    renderPanel([
      match({ id: "a", event: "VCT 2026: Americas Stage 2" }),
      match({ id: "b", event: "VCT 2026: EMEA Stage 2" }),
    ]);

    expect(screen.getByRole("button", { name: /^Todos/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByRole("button", { name: /^Internacional/ }),
    ).not.toBeInTheDocument();
  });

  it("abrindo em 'Internacional', 'Todos' continua a um clique", async () => {
    const user = userEvent.setup();
    renderPanel([
      match({ id: "a", teamA: "NRG", event: "VCT 2026: Americas Stage 2" }),
      match({
        id: "b",
        teamA: "FNATIC",
        teamB: "LOUD",
        event: "Valorant Champions 2026",
      }),
    ]);

    await user.click(screen.getByRole("button", { name: /^Todos/ }));

    expect(screen.getByText(/NRG/)).toBeInTheDocument();
    expect(screen.getByText(/FNATIC/)).toBeInTheDocument();
  });

  it("em 'Todos', não há relógio de mercado — só a regra", () => {
    renderPanel([match()]);

    expect(screen.queryByText(/Mercado fecha em/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Escolha uma região para ver quando o dela fecha/),
    ).toBeInTheDocument();
  });

  it("escolher uma região traz o relógio dela", async () => {
    const user = userEvent.setup();
    renderPanel([
      match({ id: "a", event: "VCT 2026: Americas Stage 2" }),
      match({
        id: "b",
        event: "VCT 2026: EMEA Stage 2",
        scheduledAt: new Date("2026-09-05T17:00:00Z"),
      }),
    ]);

    await user.click(screen.getByRole("button", { name: /Americas/ }));

    // NOW é 03/09 12:00Z; o mercado de Americas fecha 04/09 16:00Z.
    expect(screen.getByText("Mercado fecha em 28h 0m")).toBeInTheDocument();
  });

  it("o relógio segue a região escolhida, não o circuito inteiro", async () => {
    const user = userEvent.setup();
    renderPanel([
      match({ id: "a", event: "VCT 2026: Americas Stage 2" }),
      match({
        id: "b",
        event: "VCT 2026: EMEA Stage 2",
        scheduledAt: new Date("2026-09-05T17:00:00Z"),
      }),
    ]);

    await user.click(screen.getByRole("button", { name: /EMEA/ }));

    expect(screen.getByText("Mercado fecha em 52h 0m")).toBeInTheDocument();
  });

  it("voltar para 'Todos' tira o relógio de novo", async () => {
    const user = userEvent.setup();
    renderPanel([
      match({ id: "a", event: "VCT 2026: Americas Stage 2" }),
      match({
        id: "b",
        event: "VCT 2026: EMEA Stage 2",
        scheduledAt: new Date("2026-09-05T17:00:00Z"),
      }),
    ]);

    await user.click(screen.getByRole("button", { name: /Americas/ }));
    await user.click(screen.getByRole("button", { name: /Todos/ }));

    expect(screen.queryByText(/Mercado fecha em/)).not.toBeInTheDocument();
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

  it("mesmo com uma única região na grade, as quatro ligas aparecem no filtro", () => {
    renderPanel([match({ id: "a" }), match({ id: "b" })]);

    const filters = screen.getByRole("group", { name: "Filtrar por região" });
    const labels = within(filters)
      .getAllByRole("button")
      .map((button) => button.textContent);

    // Só Americas jogou, mas as outras três ligas continuam oferecidas —
    // o usuário tem time nelas e precisa poder conferir "não tem nada".
    expect(labels).toEqual([
      "Todos2",
      "Americas2",
      "EMEA0",
      "Pacific0",
      "China0",
    ]);
  });

  it("oferece as regiões com a internacional à frente, e cada liga soma os internacionais", () => {
    renderPanel([
      match({ id: "a", event: "VCT 2026: Americas Stage 2" }),
      match({ id: "b", event: "VCT 2026: EMEA Stage 2" }),
      match({ id: "c", event: "Valorant Champions 2026" }),
    ]);

    const filters = screen.getByRole("group", { name: "Filtrar por região" });
    const labels = within(filters)
      .getAllByRole("button")
      .map((button) => button.textContent);

    // Cada liga entrega os dela + o Champions — inclusive Pacific e China,
    // que não têm jogo próprio nesta grade.
    expect(labels).toEqual([
      "Todos3",
      "Internacional1",
      "Americas2",
      "EMEA2",
      "Pacific1",
      "China1",
    ]);
  });

  it("clicar numa liga sem jogo agendado explica isso, em vez de mostrar uma grade vazia", async () => {
    const user = userEvent.setup();
    renderPanel([match({ id: "a", event: "VCT 2026: Americas Stage 2" })]);

    await user.click(screen.getByRole("button", { name: /^EMEA/ }));

    expect(
      screen.getByText("Nenhum jogo de EMEA agendado no momento."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/NRG/)).not.toBeInTheDocument();
  });

  it("o jogo de Champions aparece com Americas selecionado", async () => {
    const user = userEvent.setup();
    renderPanel([
      match({ id: "a", teamA: "NRG", event: "VCT 2026: Americas Stage 2" }),
      match({
        id: "b",
        teamA: "FNATIC",
        teamB: "LOUD",
        event: "Valorant Champions 2026",
      }),
    ]);

    await user.click(screen.getByRole("button", { name: /Americas/ }));

    expect(screen.getByText(/NRG/)).toBeInTheDocument();
    expect(screen.getByText(/FNATIC/)).toBeInTheDocument();
  });

  it("duas ligas da mesma região caem num chip só", () => {
    renderPanel([
      match({ id: "a", event: "VCT 2026: Americas Stage 2" }),
      match({ id: "b", event: "Challengers 2026: Brazil Split 2" }),
      match({ id: "c", event: "VCT 2026: EMEA Stage 2" }),
    ]);

    const filters = screen.getByRole("group", { name: "Filtrar por região" });
    const labels = within(filters)
      .getAllByRole("button")
      .map((button) => button.textContent);

    // VCT Americas e Challengers Brazil somam no mesmo chip: era isso que
    // obrigava o usuário a alternar dois filtros para ver a própria liga.
    expect(labels).toEqual([
      "Todos3",
      "Americas2",
      "EMEA1",
      "Pacific0",
      "China0",
    ]);
  });

  it("escolher uma região deixa só os jogos dela na lista", async () => {
    const user = userEvent.setup();
    renderPanel([
      match({ id: "a", teamA: "NRG", event: "VCT 2026: Americas Stage 2" }),
      match({
        id: "b",
        teamA: "FNATIC",
        teamB: "Team Heretics",
        event: "VCT 2026: EMEA Stage 2",
      }),
    ]);

    await user.click(screen.getByRole("button", { name: /EMEA/ }));

    expect(screen.getByText(/FNATIC/)).toBeInTheDocument();
    expect(screen.queryByText(/NRG/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /EMEA/ })).toHaveAttribute(
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
        event: "VCT 2026: EMEA Stage 2",
      }),
    ]);

    await user.click(screen.getByRole("button", { name: /EMEA/ }));
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

  it("o mesmo instante, escrito no fuso de quem está lendo", () => {
    renderPanel([match()], [], "Asia/Tokyo");

    const row = screen.getByRole("listitem");
    // 17:00Z é 14:00 em São Paulo (teste acima) e 02:00 do dia seguinte em
    // Tóquio — mesmo instante, outra frase.
    expect(within(row).getByText("02:00")).toBeInTheDocument();
    // O fechamento (16:00Z) é 13:00 em São Paulo e 01:00 em Tóquio.
    expect(screen.getByText("Mercado fecha 01:00")).toBeInTheDocument();
  });

  it("o instante gravado no dateTime não muda com o fuso de exibição", () => {
    renderPanel([match()], [], "Asia/Tokyo");

    const [kickoff, marketClose] = screen
      .getByRole("listitem")
      .querySelectorAll("time");
    expect(kickoff).toHaveAttribute(
      "dateTime",
      new Date("2026-09-04T17:00:00Z").toISOString(),
    );
    expect(marketClose).toHaveAttribute(
      "dateTime",
      new Date("2026-09-04T16:00:00Z").toISOString(),
    );
  });

  it("a contagem regressiva do fechamento é a mesma em qualquer fuso — é duração, não hora", async () => {
    const user = userEvent.setup();
    renderPanel(
      [match({ id: "a", event: "VCT 2026: Americas Stage 2" })],
      [],
      "Asia/Tokyo",
    );

    await user.click(screen.getByRole("button", { name: /Americas/ }));

    expect(screen.getByText("Mercado fecha em 28h 0m")).toBeInTheDocument();
  });

  it("mostra em que fuso os horários estão", () => {
    renderPanel([match()], [], "Asia/Tokyo");

    expect(
      screen.getByText("Horários em GMT+9 (seu fuso)"),
    ).toBeInTheDocument();
  });

  it("uma grade bem longa cresce em blocos, não tudo de uma vez", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 40 }, (_, index) =>
      match({
        id: `m${index}`,
        teamA: `Time ${index}`,
        scheduledAt: new Date(
          new Date("2026-09-04T17:00:00Z").getTime() + index * 3_600_000,
        ),
      }),
    );
    renderPanel(many);

    // 40 jogos, 12 visíveis: o primeiro clique acrescenta o passo (24), não
    // os 28 restantes de uma vez só.
    await user.click(screen.getByRole("button", { name: "Ver mais 24 jogos" }));

    expect(screen.getByText(/Time 35/)).toBeInTheDocument();
    expect(screen.queryByText(/Time 36/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver mais 4 jogos" }));

    expect(screen.getByText(/Time 39/)).toBeInTheDocument();
  });
});
