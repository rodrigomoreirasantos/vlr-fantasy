import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/ranking/actions", () => ({
  createChampionship: "createChampionship-token",
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn(), isExecuting: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EmptyChampionships } from "@/components/championship/empty-championships";

describe("EmptyChampionships", () => {
  it("sem region, mostra o texto genérico", () => {
    render(<EmptyChampionships />);

    expect(
      screen.getByText("Você ainda não está em nenhum campeonato."),
    ).toBeInTheDocument();
  });

  it("é o alvo 'campeonatos' do tour guiado", () => {
    const { container } = render(<EmptyChampionships />);

    expect(container.querySelector('[data-tour="campeonatos"]')).not.toBeNull();
  });

  it("com region='pacific', cita a região e oferece o botão de criar", () => {
    render(<EmptyChampionships region="pacific" />);

    expect(
      screen.getByText("Você ainda não tem campeonato em Pacific."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /criar campeonato/i }),
    ).toBeInTheDocument();
  });
});
