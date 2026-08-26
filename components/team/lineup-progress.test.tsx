import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LineupProgress } from "@/components/team/lineup-progress";

describe("LineupProgress", () => {
  it("mostra quantos jogadores já foram escalados", () => {
    render(<LineupProgress filled={2} total={5} />);

    expect(
      screen.getByText("Monte seu time · 2 de 5 jogadores escalados"),
    ).toBeInTheDocument();
  });

  it("com o time vazio, mostra a chamada para o primeiro jogador", () => {
    render(<LineupProgress filled={0} total={5} />);

    expect(
      screen.getByText(
        "Clique em uma vaga para contratar seu primeiro jogador.",
      ),
    ).toBeInTheDocument();
  });

  it("com pelo menos um jogador escalado, não repete a chamada inicial", () => {
    render(<LineupProgress filled={1} total={5} />);

    expect(
      screen.queryByText(
        "Clique em uma vaga para contratar seu primeiro jogador.",
      ),
    ).not.toBeInTheDocument();
  });
});
