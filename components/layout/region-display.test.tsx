import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  RegionDisplayProvider,
  RegionDisplaySync,
  useRegionDisplay,
} from "@/components/layout/region-display";
import { regionLabel } from "@/lib/round/regions";

/** Um consumidor mínimo, no lugar do `AppHeader`. */
function Display() {
  const { region, points } = useRegionDisplay();
  return (
    <p>
      {regionLabel(region)} · {points}
    </p>
  );
}

describe("RegionDisplay", () => {
  it("sem sync, mostra o valor semeado pelo layout", () => {
    render(
      <RegionDisplayProvider initial={{ region: "americas", points: 10 }}>
        <Display />
      </RegionDisplayProvider>,
    );

    expect(screen.getByText("Americas · 10")).toBeInTheDocument();
  });

  it("a página publica a região da navegação e o header acompanha", () => {
    render(
      <RegionDisplayProvider initial={{ region: "americas", points: 10 }}>
        <Display />
        <RegionDisplaySync region="emea" points={42} />
      </RegionDisplayProvider>,
    );

    // É o cenário do layout que não re-renderiza: o valor semeado é de
    // Americas, mas quem manda é a página, que resolveu EMEA.
    expect(screen.getByText("EMEA · 42")).toBeInTheDocument();
  });

  it("re-publicar o mesmo valor não muda nada", () => {
    const { rerender } = render(
      <RegionDisplayProvider initial={{ region: "americas", points: 10 }}>
        <Display />
        <RegionDisplaySync region="emea" points={42} />
      </RegionDisplayProvider>,
    );

    rerender(
      <RegionDisplayProvider initial={{ region: "americas", points: 10 }}>
        <Display />
        <RegionDisplaySync region="emea" points={42} />
      </RegionDisplayProvider>,
    );

    expect(screen.getByText("EMEA · 42")).toBeInTheDocument();
  });

  it("fora do provider, o consumidor falha alto em vez de inventar uma região", () => {
    expect(() => render(<Display />)).toThrowError(
      /precisa de <RegionDisplayProvider>/,
    );
  });
});
