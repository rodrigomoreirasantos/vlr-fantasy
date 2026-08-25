import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlayerScore } from "@/components/team/player-score";
import { SCORE_THRESHOLDS } from "@/lib/team/score";

describe("PlayerScore", () => {
  it("formata a pontuação com uma casa decimal", () => {
    render(<PlayerScore score={24.6} />);

    expect(screen.getByText("24.6")).toBeInTheDocument();
  });

  it("colore como positiva a pontuação no topo da faixa", () => {
    render(<PlayerScore score={SCORE_THRESHOLDS.positive} />);

    expect(screen.getByText(/\d/)).toHaveClass("text-success");
  });

  it("colore como negativa a pontuação abaixo da faixa neutra", () => {
    render(<PlayerScore score={SCORE_THRESHOLDS.neutral - 0.1} />);

    expect(screen.getByText(/\d/)).toHaveClass("text-primary");
  });

  it("recua o chip neutro contra a superfície onde ele está", () => {
    const { rerender } = render(
      <PlayerScore score={SCORE_THRESHOLDS.neutral} surface="secondary" />,
    );
    expect(screen.getByText(/\d/)).toHaveClass("bg-card");

    rerender(<PlayerScore score={SCORE_THRESHOLDS.neutral} surface="card" />);
    expect(screen.getByText(/\d/)).toHaveClass("bg-secondary");
  });
});
