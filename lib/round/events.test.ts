// @vitest-environment node
import { describe, expect, it } from "vitest";

import { shortEventLabel } from "@/lib/round/events";

describe("shortEventLabel", () => {
  it("corta o circuito e o ano, que se repetem em toda linha", () => {
    expect(shortEventLabel("VCT 2026: Americas Stage 2")).toBe(
      "Americas Stage 2",
    );
    expect(shortEventLabel("Champions Tour 2026: Pacific Stage 1")).toBe(
      "Pacific Stage 1",
    );
    expect(shortEventLabel("Valorant Champions 2026")).toBe("Champions");
  });

  it("um nome que não segue o padrão fica inteiro", () => {
    expect(shortEventLabel("Red Bull Home Ground")).toBe(
      "Red Bull Home Ground",
    );
  });
});
