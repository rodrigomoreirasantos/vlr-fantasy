import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const usePathnameMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth-client", () => ({
  signOut: vi.fn(),
}));

import { AppHeader } from "@/components/layout/app-header";

describe("AppHeader", () => {
  it("marca 'Ranking' como página atual quando a rota é /ranking", () => {
    usePathnameMock.mockReturnValue("/ranking");
    render(
      <AppHeader teamName="Rodrigo FC" points={78.5} userName="Rodrigo" />,
    );

    expect(screen.getByRole("link", { name: /ranking/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: /escalação/i }),
    ).not.toHaveAttribute("aria-current");
  });

  it("marca 'Escalação' como página atual quando a rota é /my-team", () => {
    usePathnameMock.mockReturnValue("/my-team");
    render(
      <AppHeader teamName="Rodrigo FC" points={78.5} userName="Rodrigo" />,
    );

    expect(screen.getByRole("link", { name: /escalação/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /ranking/i })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("itens sem rota não são links", () => {
    usePathnameMock.mockReturnValue("/my-team");
    render(
      <AppHeader teamName="Rodrigo FC" points={78.5} userName="Rodrigo" />,
    );

    expect(
      screen.queryByRole("link", { name: /início/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /perfil/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Início")).toBeInTheDocument();
  });

  it("mostra o nome do time, os pontos e a saudação", () => {
    usePathnameMock.mockReturnValue("/my-team");
    render(
      <AppHeader teamName="Rodrigo FC" points={78.5} userName="Rodrigo" />,
    );

    expect(screen.getByText("Rodrigo FC")).toBeInTheDocument();
    expect(screen.getByText("78.5")).toBeInTheDocument();
    expect(screen.getByText("Rodrigo")).toBeInTheDocument();
  });
});
