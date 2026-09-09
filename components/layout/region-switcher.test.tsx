import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const usePathnameMock = vi.fn();
const useSearchParamsMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useSearchParams: () => useSearchParamsMock(),
}));

import { RegionSwitcher } from "@/components/layout/region-switcher";
import { LEAGUE_REGIONS, TEAM_REGIONS } from "@/lib/round/regions";

describe("RegionSwitcher", () => {
  it("abre pelo gatilho e lista as 4 regiões de liga, sem torneio internacional", async () => {
    usePathnameMock.mockReturnValue("/my-team");
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    const user = userEvent.setup();

    render(<RegionSwitcher current="americas" available={LEAGUE_REGIONS} />);

    await user.click(
      screen.getByRole("button", { name: /trocar de região \(americas\)/i }),
    );

    expect(await screen.findAllByRole("menuitem")).toHaveLength(4);
    expect(screen.queryByText("Internacional")).not.toBeInTheDocument();
  });

  it("com torneio internacional, lista as 5 regiões", async () => {
    usePathnameMock.mockReturnValue("/my-team");
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    const user = userEvent.setup();

    render(<RegionSwitcher current="americas" available={TEAM_REGIONS} />);

    await user.click(
      screen.getByRole("button", { name: /trocar de região \(americas\)/i }),
    );

    expect(await screen.findAllByRole("menuitem")).toHaveLength(5);
    expect(screen.getByText("Internacional")).toBeInTheDocument();
  });

  it("cada item aponta para a rota atual, preservando os demais parâmetros", async () => {
    usePathnameMock.mockReturnValue("/ranking");
    useSearchParamsMock.mockReturnValue(new URLSearchParams("c=abc"));
    const user = userEvent.setup();

    render(<RegionSwitcher current="americas" available={LEAGUE_REGIONS} />);

    await user.click(
      screen.getByRole("button", { name: /trocar de região \(americas\)/i }),
    );

    expect(await screen.findByText("EMEA")).toBeInTheDocument();
    expect(screen.getByText("EMEA").closest("a")).toHaveAttribute(
      "href",
      "/ranking?c=abc&region=emea",
    );
  });

  it("marca a região atual com aria-current='page'", async () => {
    usePathnameMock.mockReturnValue("/my-team");
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    const user = userEvent.setup();

    render(<RegionSwitcher current="emea" available={LEAGUE_REGIONS} />);

    await user.click(
      screen.getByRole("button", { name: /trocar de região \(emea\)/i }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "EMEA" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("menuitem", { name: "Americas" }),
    ).not.toHaveAttribute("aria-current");
  });
});
