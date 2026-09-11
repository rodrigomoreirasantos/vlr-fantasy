// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/vlr/http/log", () => ({ logWarn: vi.fn() }));

import { vlrImageUrl } from "@/lib/vlr/scrapers/parse";
import { logWarn } from "@/lib/vlr/http/log";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("vlrImageUrl", () => {
  it("protocol-relative ganha o esquema https", () => {
    expect(vlrImageUrl("//owcdn.net/img/668b9efe31f02.png")).toBe(
      "https://owcdn.net/img/668b9efe31f02.png",
    );
  });

  it("a silhueta padrão do vlr (sem foto) vira null", () => {
    expect(vlrImageUrl("/img/base/ph/sil.png")).toBeNull();
  });

  it("URL já https fica inalterada", () => {
    expect(vlrImageUrl("https://owcdn.net/img/x.png")).toBe(
      "https://owcdn.net/img/x.png",
    );
  });

  it("URL http vira https", () => {
    expect(vlrImageUrl("http://owcdn.net/img/x.png")).toBe(
      "https://owcdn.net/img/x.png",
    );
  });

  it.each([undefined, null, "", "   "])("%s vira null", (input) => {
    expect(vlrImageUrl(input)).toBeNull();
  });

  it("caminho raiz-relativo desconhecido vira null e avisa", () => {
    expect(vlrImageUrl("/img/vlr/tmp/vlr.png")).toBeNull();
    expect(logWarn).toHaveBeenCalledWith("vlr.roster.unknown_image_host", {
      src: "/img/vlr/tmp/vlr.png",
    });
  });

  it("não avisa para entrada vazia nem para o sentinela", () => {
    vlrImageUrl("");
    vlrImageUrl("/img/base/ph/sil.png");
    expect(logWarn).not.toHaveBeenCalled();
  });

  it("é idempotente", () => {
    const once = vlrImageUrl("//owcdn.net/img/668b9efe31f02.png");
    expect(vlrImageUrl(once)).toBe(once);
  });
});
