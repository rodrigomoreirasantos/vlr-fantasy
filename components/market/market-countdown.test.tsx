import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketCountdown } from "@/components/market/market-countdown";

const closesAt = new Date("2026-03-14T18:00:00Z");

describe("MarketCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renderiza o texto do servidor no primeiro paint", () => {
    render(
      <MarketCountdown
        closesAt={closesAt}
        initialCountdown="Mercado fecha em 36h 12m"
      />,
    );

    expect(screen.getByText("Mercado fecha em 36h 12m")).toBeInTheDocument();
  });

  it("passa a tickar depois de montar", () => {
    vi.setSystemTime(new Date("2026-03-13T05:48:00Z")); // 36h12m antes do fechamento
    render(
      <MarketCountdown
        closesAt={closesAt}
        initialCountdown="Mercado fecha em 36h 12m"
      />,
    );

    // Passa 24h: o relógio real avançou 12h12m mais perto do fechamento.
    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    });
    expect(screen.getByText("Mercado fecha em 12h 12m")).toBeInTheDocument();
  });

  it("um initialCountdown novo substitui o texto na hora, sem esperar o tick", () => {
    // É o caso do `MarketSheet`: ele monta com a frase da página (parada há
    // minutos) e só depois `loadMarket` traz a do servidor. Esperar 30s pelo
    // primeiro tick deixaria o valor velho na tela por mais tempo do que a
    // maioria das visitas ao modal dura.
    const { rerender } = render(
      <MarketCountdown
        closesAt={closesAt}
        initialCountdown="Mercado fecha em 36h 12m"
      />,
    );

    rerender(
      <MarketCountdown
        closesAt={closesAt}
        initialCountdown="Mercado fecha em 2h 0m"
      />,
    );

    expect(screen.getByText("Mercado fecha em 2h 0m")).toBeInTheDocument();
  });

  it("mercado já encerrado: nunca mostra 'fecha em Encerrado'", () => {
    vi.setSystemTime(new Date("2026-03-14T17:59:30Z"));
    render(
      <MarketCountdown
        closesAt={closesAt}
        initialCountdown="Mercado fecha em 0m"
      />,
    );

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("Mercado fechado")).toBeInTheDocument();
  });
});
