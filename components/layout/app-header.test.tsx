import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const usePathnameMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth-client", () => ({
  signOut: vi.fn(),
}));

import { AppHeader } from "@/components/layout/app-header";
import {
  RegionDisplayProvider,
  type RegionDisplay,
} from "@/components/layout/region-display";
import { DEFAULT_CREST } from "@/lib/crest/crest";
import { LEAGUE_REGIONS } from "@/lib/round/regions";

/**
 * Região e saldo vêm do contexto, não de props — é o que mantém o header em
 * dia numa navegação que não re-renderiza o layout (ver
 * `components/layout/region-display.tsx`).
 */
function renderHeader(
  overrides: Partial<React.ComponentProps<typeof AppHeader>> = {},
  display: RegionDisplay = { region: "americas", balanceCents: 14_820 },
) {
  return render(
    <RegionDisplayProvider initial={display}>
      <AppHeader
        teamName="Rodrigo FC"
        crest={DEFAULT_CREST}
        userName="Rodrigo"
        available={LEAGUE_REGIONS}
        {...overrides}
      />
    </RegionDisplayProvider>,
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
  });

  it("não existe mais o item Menu", () => {
    usePathnameMock.mockReturnValue("/my-team");
    renderHeader();

    expect(
      screen.queryByRole("link", { name: /menu/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Menu")).not.toBeInTheDocument();
  });

  it("o logo é link para /home", () => {
    usePathnameMock.mockReturnValue("/my-team");
    renderHeader();

    expect(screen.getByRole("link", { name: /vlrfantasy/i })).toHaveAttribute(
      "href",
      "/home",
    );
  });

  it("mostra o nome do time, o brasão, o saldo e a saudação", () => {
    usePathnameMock.mockReturnValue("/my-team");
    renderHeader();

    expect(screen.getByText("Rodrigo FC")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Brasão de Rodrigo FC" }),
    ).toBeInTheDocument();
    expect(screen.getByText("148.2")).toBeInTheDocument();
    expect(screen.queryByText("pts")).not.toBeInTheDocument();
    expect(screen.getByText("Rodrigo")).toBeInTheDocument();
  });

  it("mostra a região e o saldo do time em exibição", () => {
    usePathnameMock.mockReturnValue("/my-team");
    renderHeader({}, { region: "emea", balanceCents: 1_250 });

    expect(screen.getByText("EMEA")).toBeInTheDocument();
    expect(screen.getByText("12.5")).toBeInTheDocument();
  });
});
