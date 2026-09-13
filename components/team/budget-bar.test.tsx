import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BudgetBar } from "@/components/team/budget-bar";
import { DREAM_TEAM_CENTS } from "@/lib/market/budget";

describe("BudgetBar", () => {
  it("mostra saldo, valor do elenco e patrimônio", () => {
    render(
      <BudgetBar
        balanceCents={5_000}
        squadValueCents={20_000}
        lastSquadValuationCents={null}
      />,
    );

    expect(screen.getByText("Saldo")).toBeInTheDocument();
    expect(screen.getByText("50.0")).toBeInTheDocument();
    expect(screen.getByText("Valor do elenco")).toBeInTheDocument();
    expect(screen.getByText("200.0")).toBeInTheDocument();
    expect(screen.getByText("Patrimônio")).toBeInTheDocument();
    // 5.000 + 20.000 = 25.000 cents → 250,0.
    expect(screen.getByText("250.0")).toBeInTheDocument();
  });

  it("é o alvo 'orcamento' do tour guiado", () => {
    const { container } = render(
      <BudgetBar
        balanceCents={5_000}
        squadValueCents={20_000}
        lastSquadValuationCents={null}
      />,
    );

    expect(container.querySelector('[data-tour="orcamento"]')).not.toBeNull();
  });

  it("a barra é um progressbar contra o time dos sonhos (DREAM_TEAM_CENTS)", () => {
    render(
      <BudgetBar
        balanceCents={5_000}
        squadValueCents={20_000}
        lastSquadValuationCents={null}
      />,
    );

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "25000");
    expect(bar).toHaveAttribute("aria-valuemax", String(DREAM_TEAM_CENTS));
  });

  it("a barra nunca extrapola, mesmo com patrimônio acima do time dos sonhos", () => {
    render(
      <BudgetBar
        balanceCents={0}
        squadValueCents={DREAM_TEAM_CENTS + 10_000}
        lastSquadValuationCents={null}
      />,
    );

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", String(DREAM_TEAM_CENTS));
  });

  it("patrimônio abaixo do time dos sonhos: mostra quanto falta", () => {
    render(
      <BudgetBar
        balanceCents={5_000}
        squadValueCents={20_000}
        lastSquadValuationCents={null}
      />,
    );

    expect(screen.getByText(/Faltam .+ para poder escalar os 5 mais caros\./)).toBeInTheDocument();
  });

  it("patrimônio no time dos sonhos ou acima: avisa que já pode escalar os 5 mais caros", () => {
    render(
      <BudgetBar
        balanceCents={0}
        squadValueCents={DREAM_TEAM_CENTS}
        lastSquadValuationCents={null}
      />,
    );

    expect(
      screen.getByText("Você já pode escalar os 5 mais caros."),
    ).toBeInTheDocument();
  });

  it("null ou 0: nenhuma frase de última rodada", () => {
    const { rerender } = render(
      <BudgetBar
        balanceCents={5_000}
        squadValueCents={20_000}
        lastSquadValuationCents={null}
      />,
    );
    expect(screen.queryByText(/Última rodada/)).not.toBeInTheDocument();

    rerender(
      <BudgetBar
        balanceCents={5_000}
        squadValueCents={20_000}
        lastSquadValuationCents={0}
      />,
    );
    expect(screen.queryByText(/Última rodada/)).not.toBeInTheDocument();
  });

  it("valorização negativa: mostra 'desvalorizou' em destaque", () => {
    render(
      <BudgetBar
        balanceCents={5_000}
        squadValueCents={20_000}
        lastSquadValuationCents={-900}
      />,
    );

    expect(
      screen.getByText((_, node) => node?.textContent === "Última rodada: sua escalação desvalorizou 9.0 cr."),
    ).toBeInTheDocument();
  });

  it("valorização positiva: mostra 'valorizou' em destaque", () => {
    render(
      <BudgetBar
        balanceCents={5_000}
        squadValueCents={20_000}
        lastSquadValuationCents={350}
      />,
    );

    expect(
      screen.getByText((_, node) => node?.textContent === "Última rodada: sua escalação valorizou 3.5 cr."),
    ).toBeInTheDocument();
  });

  it("nenhuma menção a 'teto'", () => {
    render(
      <BudgetBar
        balanceCents={5_000}
        squadValueCents={20_000}
        lastSquadValuationCents={-900}
      />,
    );

    expect(screen.queryByText(/teto/i)).not.toBeInTheDocument();
  });
});
