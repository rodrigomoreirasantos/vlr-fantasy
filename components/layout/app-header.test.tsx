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
import { DEFAULT_CREST } from "@/lib/crest/crest";

function renderHeader(
  overrides: Partial<React.ComponentProps<typeof AppHeader>> = {},
) {
  return render(
    <AppHeader
      teamName="Rodrigo FC"
      crest={DEFAULT_CREST}
      points={78.5}
      userName="Rodrigo"
      {...overrides}
    />,
  );
}

describe("AppHeader", () => {
  it("marca 'Ranking' como página atual quando a rota é /ranking", () => {
    usePathnameMock.mockReturnValue("/ranking");
    renderHeader();

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
    renderHeader();

    expect(screen.getByRole("link", { name: /escalação/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /ranking/i })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marca 'Perfil' como página atual quando a rota é /profile", () => {
    usePathnameMock.mockReturnValue("/profile");
    renderHeader();

    expect(screen.getByRole("link", { name: /perfil/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marca 'Início' como página atual quando a rota é /home", () => {
    usePathnameMock.mockReturnValue("/home");
    renderHeader();

    expect(screen.getByRole("link", { name: /início/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /início/i })).toHaveAttribute(
      "href",
      "/home",
    );
  });

  it("itens sem rota não são links", () => {
    usePathnameMock.mockReturnValue("/my-team");
    renderHeader();

    expect(
      screen.queryByRole("link", { name: /menu/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Menu")).toBeInTheDocument();
  });

  it("mostra o nome do time, o brasão, os pontos e a saudação", () => {
    usePathnameMock.mockReturnValue("/my-team");
    renderHeader();

    expect(screen.getByText("Rodrigo FC")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Brasão de Rodrigo FC" }),
    ).toBeInTheDocument();
    expect(screen.getByText("78.5")).toBeInTheDocument();
    expect(screen.getByText("Rodrigo")).toBeInTheDocument();
  });
});
