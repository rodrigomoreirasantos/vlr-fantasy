import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MarketPlayerRow } from "@/components/market/market-player-row";
import type { SubstitutionContext } from "@/lib/market/eligibility";
import type { Player } from "@/lib/team/types";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "tenz",
    nickname: "TenZ",
    team: "SENTINELS",
    agent: "Jett",
    role: "Duelista",
    score: 18.2,
    priceCents: 5000,
    active: true,
    ...overrides,
  };
}

function makeContext(overrides: Partial<SubstitutionContext> = {}): SubstitutionContext {
  return {
    marketOpen: true,
    balanceCents: 10_000,
    outgoing: makePlayer({ id: "derke", nickname: "Derke", priceCents: 4000 }),
    rosteredPlayerIds: ["derke"],
    ...overrides,
  };
}

describe("MarketPlayerRow", () => {
  it("candidato comprável: clique chama onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const candidate = makePlayer({ priceCents: 3000 });

    render(
      <ul>
        <MarketPlayerRow ctx={makeContext()} candidate={candidate} onConfirm={onConfirm} />
      </ul>,
    );

    await user.click(
      screen.getByRole("button", { name: /contratar tenz por 30\.0/i }),
    );

    expect(onConfirm).toHaveBeenCalledWith(candidate);
  });

  it("candidato caro demais: aparece com motivo legível, aria-disabled, e o clique não chama onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const candidate = makePlayer({ priceCents: 1_000_000 });

    render(
      <ul>
        <MarketPlayerRow
          ctx={makeContext({ balanceCents: 0 })}
          candidate={candidate}
          onConfirm={onConfirm}
        />
      </ul>,
    );

    expect(
      screen.getByText("Saldo insuficiente para esta contratação."),
    ).toBeInTheDocument();

    const button = screen.getByRole("button", { name: /contratar tenz/i });
    expect(button).toHaveAttribute("aria-disabled", "true");

    await user.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("função errada: aparece bloqueado com o motivo correspondente", () => {
    const candidate = makePlayer({ role: "Sentinela" });

    render(
      <ul>
        <MarketPlayerRow ctx={makeContext()} candidate={candidate} onConfirm={vi.fn()} />
      </ul>,
    );

    expect(
      screen.getByText("Só é possível substituir por outro Duelista."),
    ).toBeInTheDocument();
  });

  it("mostra o preço sempre com uma casa decimal", () => {
    const candidate = makePlayer({ priceCents: 14820 });

    render(
      <ul>
        <MarketPlayerRow ctx={makeContext()} candidate={candidate} onConfirm={vi.fn()} />
      </ul>,
    );

    expect(screen.getByText("148.2")).toBeInTheDocument();
  });
});
