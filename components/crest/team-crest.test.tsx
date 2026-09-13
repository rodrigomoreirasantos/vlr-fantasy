import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TeamCrest } from "@/components/crest/team-crest";
import { CREST_COLORS, CREST_SHAPES, CREST_SYMBOLS } from "@/lib/crest/catalog";
import { parseCrest } from "@/lib/crest/crest";

describe("TeamCrest", () => {
  it("renderiza com o rótulo acessível informado", () => {
    const crest = parseCrest({
      shape: "diamond",
      symbol: "flame",
      background: "cyan",
      foreground: "white",
      border: "amber",
    });

    render(<TeamCrest crest={crest} title="Brasão de Sentinels BR" />);

    expect(
      screen.getByRole("img", { name: "Brasão de Sentinels BR" }),
    ).toBeInTheDocument();
  });

  it("forma e símbolo fora do catálogo ainda renderizam, graças a parseCrest", () => {
    const crest = parseCrest({
      shape: "forma-removida-do-catalogo",
      symbol: "simbolo-removido-do-catalogo",
      background: "red",
      foreground: "white",
      border: "graphite",
    });

    render(<TeamCrest crest={crest} title="Brasão desconhecido" />);

    expect(
      screen.getByRole("img", { name: "Brasão desconhecido" }),
    ).toBeInTheDocument();
  });

  it.each(CREST_SHAPES)("renderiza o formato '%s' (plano 28)", (shape) => {
    render(
      <TeamCrest
        crest={parseCrest({
          shape,
          symbol: "crosshair",
          background: "red",
          foreground: "white",
          border: "graphite",
        })}
        title={`Brasão ${shape}`}
      />,
    );

    expect(screen.getByRole("img", { name: `Brasão ${shape}` })).toBeInTheDocument();
  });

  it.each(CREST_SYMBOLS)("renderiza o símbolo '%s' (plano 28)", (symbol) => {
    render(
      <TeamCrest
        crest={parseCrest({
          shape: "shield",
          symbol,
          background: "red",
          foreground: "white",
          border: "graphite",
        })}
        title={`Brasão ${symbol}`}
      />,
    );

    expect(screen.getByRole("img", { name: `Brasão ${symbol}` })).toBeInTheDocument();
  });

  it.each(CREST_COLORS)("aceita a cor '%s' em qualquer campo (plano 28)", (color) => {
    render(
      <TeamCrest
        crest={parseCrest({
          shape: "shield",
          symbol: "crosshair",
          background: color,
          foreground: color,
          border: color,
        })}
        title={`Brasão ${color}`}
      />,
    );

    const img = screen.getByRole("img", { name: `Brasão ${color}` });
    expect(img.querySelector("path")).toHaveStyle({
      fill: `var(--crest-${color})`,
    });
  });
});
