import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TeamCrest } from "@/components/crest/team-crest";
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
});
