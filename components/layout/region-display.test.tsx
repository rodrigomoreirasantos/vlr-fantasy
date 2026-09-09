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
  const { region, balanceCents } = useRegionDisplay();
  return (
    <p>
      {regionLabel(region)} · {balanceCents}
    </p>
  );
}

describe("RegionDisplay", () => {
  it("sem sync, mostra o valor semeado pelo layout", () => {
    render(
      <RegionDisplayProvider initial={{ region: "americas", balanceCents: 10 }}>
        <Display />
      </RegionDisplayProvider>,
    );

    expect(screen.getByText("Americas · 10")).toBeInTheDocument();
  });

  it("a página publica a região da navegação e o header acompanha", () => {
    render(
      <RegionDisplayProvider initial={{ region: "americas", balanceCents: 10 }}>
        <Display />
        <RegionDisplaySync region="emea" balanceCents={42} />
      </RegionDisplayProvider>,
    );

    // É o cenário do layout que não re-renderiza: o valor semeado é de
    // Americas, mas quem manda é a página, que resolveu EMEA.
    expect(screen.getByText("EMEA · 42")).toBeInTheDocument();
  });

  it("re-publicar o mesmo valor não muda nada", () => {
    const { rerender } = render(
      <RegionDisplayProvider initial={{ region: "americas", balanceCents: 10 }}>
        <Display />
        <RegionDisplaySync region="emea" balanceCents={42} />
      </RegionDisplayProvider>,
    );

    rerender(
      <RegionDisplayProvider initial={{ region: "americas", balanceCents: 10 }}>
        <Display />
        <RegionDisplaySync region="emea" balanceCents={42} />
      </RegionDisplayProvider>,
    );

    expect(screen.getByText("EMEA · 42")).toBeInTheDocument();
  });

  it("publicar outro saldo na mesma região atualiza o header", () => {
    const { rerender } = render(
      <RegionDisplayProvider initial={{ region: "americas", balanceCents: 10 }}>
        <Display />
        <RegionDisplaySync region="americas" balanceCents={10} />
      </RegionDisplayProvider>,
    );

    // O cenário de compra/venda: a mesma região, mas `revalidatePath`
    // re-renderiza a página com um saldo novo, e o sync republica.
    rerender(
      <RegionDisplayProvider initial={{ region: "americas", balanceCents: 10 }}>
        <Display />
        <RegionDisplaySync region="americas" balanceCents={7_500} />
      </RegionDisplayProvider>,
    );

    expect(screen.getByText("Americas · 7500")).toBeInTheDocument();
  });

  it("fora do provider, o consumidor falha alto em vez de inventar uma região", () => {
    expect(() => render(<Display />)).toThrowError(
      /precisa de <RegionDisplayProvider>/,
    );
  });
});
