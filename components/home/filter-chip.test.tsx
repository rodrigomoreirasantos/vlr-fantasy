import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FilterChip } from "@/components/home/filter-chip";

describe("FilterChip", () => {
  it("anuncia o estado ligado com aria-pressed", () => {
    render(<FilterChip label="Americas" active onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: "Americas" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("um chip desligado diz que está desligado", () => {
    render(<FilterChip label="EMEA" active={false} onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: "EMEA" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("mostra quantos itens o filtro entrega", () => {
    render(
      <FilterChip label="Americas" count={12} active onSelect={() => {}} />,
    );

    expect(screen.getByRole("button").textContent).toBe("Americas12");
  });

  it("sem contagem, o chip é só o rótulo", () => {
    render(<FilterChip label="Pontos" active onSelect={() => {}} />);

    expect(screen.getByRole("button").textContent).toBe("Pontos");
  });

  it("o nome longo fica no title", () => {
    render(
      <FilterChip
        label="Americas Stage 2"
        title="VCT 2026: Americas Stage 2"
        active={false}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByRole("button")).toHaveAttribute(
      "title",
      "VCT 2026: Americas Stage 2",
    );
  });

  it("clicar avisa quem controla o filtro", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<FilterChip label="EMEA" active={false} onSelect={onSelect} />);

    await user.click(screen.getByRole("button"));

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("um chip bloqueado não dispara nada", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <FilterChip label="EMEA" active={false} disabled onSelect={onSelect} />,
    );

    await user.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
