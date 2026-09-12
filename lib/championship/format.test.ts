import { describe, expect, it } from "vitest";

import { formatInvitedAt, inviteBlockMessage } from "@/lib/championship/format";

describe("formatInvitedAt", () => {
  it("formata em português, no fuso default (São Paulo) — Bug 2 corrigido", () => {
    // Antes desta correção, formatInvitedAt não passava fuso nenhum e usava
    // o relógio do runtime (UTC na Vercel), mostrando o convite 3h adiantado.
    expect(formatInvitedAt(new Date("2026-03-14T18:00:00Z"))).toBe(
      "14/03 às 15:00",
    );
  });

  it("o mesmo instante, escrito no fuso de quem está lendo", () => {
    expect(
      formatInvitedAt(new Date("2026-03-14T18:00:00Z"), "Asia/Tokyo"),
    ).toBe("15/03 às 03:00");
  });

  it("chamar com um fuso explícito não lança — prova de fumaça dos plugins do dayjs", () => {
    expect(() =>
      formatInvitedAt(new Date(), "America/Sao_Paulo"),
    ).not.toThrow();
  });
});

describe("inviteBlockMessage", () => {
  it("traduz cada motivo de bloqueio para pt-BR", () => {
    expect(inviteBlockMessage("not_owner")).toBe(
      "Só quem criou o campeonato pode convidar.",
    );
    expect(inviteBlockMessage("self")).toBe("Você já está neste campeonato.");
    expect(inviteBlockMessage("already_member")).toBe(
      "Esse jogador já está no campeonato.",
    );
    expect(inviteBlockMessage("already_invited")).toBe(
      "Esse jogador já foi convidado.",
    );
  });
});
