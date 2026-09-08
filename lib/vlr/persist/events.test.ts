// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {}, pool: { end: vi.fn() } }));

import { upsertEvents } from "@/lib/vlr/persist/events";
import type { ScrapedEvent } from "@/lib/vlr/schemas";

const EVENT: ScrapedEvent = {
  vlrId: "2776",
  name: "Champions Tour 2026: Americas Stage 2",
  region: "br",
  startsAt: new Date("2026-08-01T00:00:00Z"),
  endsAt: new Date("2026-09-30T00:00:00Z"),
  status: "ongoing",
};

/** Captura o `set` do upsert e devolve o SQL que cada coluna gerou. */
function createTxStub() {
  let conflictSet: Record<string, unknown> | null = null;

  const tx = {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: (config: { set: Record<string, unknown> }) => {
          conflictSet = config.set;
          return {
            returning: () =>
              Promise.resolve([{ id: "event-1", vlrId: EVENT.vlrId }]),
          };
        },
      }),
    }),
  };

  return { tx, set: () => conflictSet };
}

/** O SQL de uma coluna do `set`, com os fragmentos do Drizzle achatados em texto. */
function sqlTextOf(value: unknown): string {
  const chunks = (value as { queryChunks?: unknown[] }).queryChunks ?? [];
  return chunks
    .map((chunk) =>
      typeof chunk === "object" && chunk !== null && "value" in chunk
        ? String((chunk as { value: unknown }).value)
        : String(chunk),
    )
    .join(" ");
}

describe("upsertEvents", () => {
  it("não escreve `tracked` — a allowlist é do operador", async () => {
    const { tx, set } = createTxStub();
    await upsertEvents(tx as never, [EVENT]);

    expect(Object.keys(set()!)).not.toContain("tracked");
  });

  it("preserva região e datas quando o scrap da partida vem sem elas", async () => {
    const { tx, set } = createTxStub();
    await upsertEvents(tx as never, [EVENT]);

    // `scrapeMatch` passa `region: null`; sem o `coalesce` isto apagava a
    // região que `vlr:events` tinha preenchido.
    expect(sqlTextOf(set()!.region)).toContain("coalesce");
    expect(sqlTextOf(set()!.startsAt)).toContain("coalesce");
    expect(sqlTextOf(set()!.endsAt)).toContain("coalesce");
  });

  it("'unknown' não sobrescreve um status já conhecido", async () => {
    const { tx, set } = createTxStub();
    await upsertEvents(tx as never, [EVENT]);

    expect(sqlTextOf(set()!.status)).toContain("unknown");
  });

  it("o nome, esse sim, sempre acompanha o vlr", async () => {
    const { tx, set } = createTxStub();
    await upsertEvents(tx as never, [EVENT]);

    expect(sqlTextOf(set()!.name)).not.toContain("coalesce");
  });

  it("lista vazia não consulta o banco", async () => {
    const tx = {
      insert: () => {
        throw new Error("não deveria inserir");
      },
    };
    expect((await upsertEvents(tx as never, [])).size).toBe(0);
  });

  it("devolve o mapa `vlrId → id`", async () => {
    const { tx } = createTxStub();
    const map = await upsertEvents(tx as never, [EVENT]);

    expect(map.get("2776")).toBe("event-1");
  });
});
