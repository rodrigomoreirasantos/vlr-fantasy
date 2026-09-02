import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LineupAlerts } from "@/components/home/lineup-alerts";

describe("LineupAlerts", () => {
  it("não renderiza nada com os 5 confirmados", () => {
    const { container } = render(<LineupAlerts alerts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra o nickname e o motivo de cada alerta", () => {
    render(
      <LineupAlerts
        alerts={[
          {
            position: 1,
            message:
              "TenZ não deve jogar (Lesionado): Fora por lesão no pulso.",
          },
          { position: 3, message: "A vaga 3 está vazia." },
        ]}
      />,
    );

    expect(
      screen.getByText(
        "TenZ não deve jogar (Lesionado): Fora por lesão no pulso.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("A vaga 3 está vazia.")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });
});
