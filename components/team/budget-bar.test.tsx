import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BudgetBar } from "@/components/team/budget-bar";
import { MAX_PATRIMONY_CENTS } from "@/lib/market/budget";

describe("BudgetBar", () => {
  it("mostra saldo, valor do elenco e patrimônio contra o teto", () => {
    render(
      <BudgetBar
        balanceCents={5_000}
        squadValueCents={20_000}
        budgetTrimmedCents={0}
      />,
    );

    expect(screen.getByText("Saldo")).toBeInTheDocument();
    expect(screen.getByText("50.0")).toBeInTheDocument();
    expect(screen.getByText("Valor do elenco")).toBeInTheDocument();
    expect(screen.getByText("200.0")).toBeInTheDocument();
    expect(screen.getByText("Patrimônio")).toBeInTheDocument();
    // 5.000 + 20.000 = 25.000 cents → 250,0.
    expect(screen.getByText("250.0")).toBeInTheDocument();
    expect(
      screen.getByText(`/ ${(MAX_PATRIMONY_CENTS / 100).toFixed(1)}`),
    ).toBeInTheDocument();
  });

  it("a barra é um progressbar com aria-valuenow/aria-valuemax corretos", () => {
    render(
      <BudgetBar
        balanceCents={5_000}
        squadValueCents={20_000}
        budgetTrimmedCents={0}
      />,
    );

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "25000");
    expect(bar).toHaveAttribute("aria-valuemax", String(MAX_PATRIMONY_CENTS));
  });

  it("a barra nunca extrapola o teto, mesmo com patrimônio acima dele", () => {
    render(
      <BudgetBar
        balanceCents={0}
        squadValueCents={MAX_PATRIMONY_CENTS + 10_000}
        budgetTrimmedCents={10_000}
      />,
    );

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", String(MAX_PATRIMONY_CENTS));
  });

  it("sem corte nesta rodada, não mostra a frase do teto", () => {
    render(
      <BudgetBar
        balanceCents={5_000}
        squadValueCents={20_000}
        budgetTrimmedCents={0}
      />,
    );

    expect(screen.queryByText(/cortou/)).not.toBeInTheDocument();
  });

  it("com corte nesta rodada, explica quanto foi cortado", () => {
    render(
      <BudgetBar
        balanceCents={0}
        squadValueCents={MAX_PATRIMONY_CENTS + 1_250}
        budgetTrimmedCents={1_250}
      />,
    );

    expect(
      screen.getByText((_, node) => node?.textContent === "Seu teto de 360.0 cr cortou 12.5 cr nesta rodada."),
    ).toBeInTheDocument();
  });
});
