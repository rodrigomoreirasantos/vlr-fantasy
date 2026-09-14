import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const usePathnameMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

import { BottomNav } from "@/components/layout/bottom-nav";

describe("BottomNav", () => {
  it("mostra as 4 seções", () => {
    usePathnameMock.mockReturnValue("/home");
    render(<BottomNav />);

    expect(screen.getByRole("link", { name: /início/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /perfil/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /escalação/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /ranking/i }),
    ).toBeInTheDocument();
  });

  it("marca a seção atual com aria-current", () => {
    usePathnameMock.mockReturnValue("/my-team");
    render(<BottomNav />);

    expect(screen.getByRole("link", { name: /escalação/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /início/i })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("cada seção tem um link para a rota certa", () => {
    usePathnameMock.mockReturnValue("/home");
    render(<BottomNav />);

    expect(screen.getByRole("link", { name: /ranking/i })).toHaveAttribute(
      "href",
      "/ranking",
    );
  });
});
