import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TimezoneProvider,
  TimezoneSync,
  useTimezone,
} from "@/components/layout/timezone";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

/** Um consumidor mínimo, no lugar de um card da Home. */
function Probe() {
  return <p>{useTimezone()}</p>;
}

/** Troca o fuso que `dayjs.tz.guess()` (e, com ele, `guessBrowserTimezone`) lê. */
function stubBrowserTimezone(tz: string | null) {
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    timeZone: tz ?? "",
  } as Intl.ResolvedDateTimeFormatOptions);
}

describe("TimezoneProvider / useTimezone", () => {
  it("dentro do provider, mostra o fuso semeado pelo servidor", () => {
    render(
      <TimezoneProvider tz="Asia/Tokyo">
        <Probe />
      </TimezoneProvider>,
    );

    expect(screen.getByText("Asia/Tokyo")).toBeInTheDocument();
  });

  it("fora do provider, cai no fallback — não lança (diferente de useRegionDisplay)", () => {
    render(<Probe />);

    expect(screen.getByText("America/Sao_Paulo")).toBeInTheDocument();
  });
});

describe("TimezoneSync", () => {
  beforeEach(() => {
    refreshMock.mockClear();
    document.cookie = "vlr.tz=; path=/; max-age=0";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fuso do navegador diferente do servidor: escreve o cookie e pede refresh", () => {
    stubBrowserTimezone("Asia/Tokyo");

    render(<TimezoneSync serverTz="America/Sao_Paulo" />);

    expect(document.cookie).toContain("vlr.tz=Asia/Tokyo");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("fuso do navegador igual ao do servidor: não escreve cookie nem atualiza", () => {
    stubBrowserTimezone("America/Sao_Paulo");

    render(<TimezoneSync serverTz="America/Sao_Paulo" />);

    expect(document.cookie).not.toContain("vlr.tz=");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("fuso do navegador inválido: a guarda anti-laço não faz nada", () => {
    stubBrowserTimezone("Foo/Bar");

    render(<TimezoneSync serverTz="America/Sao_Paulo" />);

    expect(document.cookie).not.toContain("vlr.tz=");
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
