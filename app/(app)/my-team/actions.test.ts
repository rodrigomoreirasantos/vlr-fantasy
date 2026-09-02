import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` porque as fábricas dos mocks içados por `vi.mock` precisam
// existir antes deles. O padrão: mockar as primitivas nomeadas de
// `lib/team/queries.ts` e, do `@/db`, só a `transaction` — nenhuma cadeia
// `select().from().where().for("update")` é montada à mão no teste.
const {
  transactionMock,
  txStub,
  getSessionMock,
  revalidatePathMock,
  lockTeamForUpdateMock,
  getActiveRoundMock,
  lockSlotForUpdateMock,
  loadPlayersByIdsMock,
  loadRosteredPlayerIdsMock,
  applySubstitutionMock,
  applySaleMock,
  setTeamCaptainMock,
  hasCaptainMock,
} = vi.hoisted(() => {
  const txStub = Symbol("tx");
  const transactionMock = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb(txStub),
  );
  return {
    transactionMock,
    txStub,
    getSessionMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    lockTeamForUpdateMock: vi.fn(),
    getActiveRoundMock: vi.fn(),
    lockSlotForUpdateMock: vi.fn(),
    loadPlayersByIdsMock: vi.fn(),
    loadRosteredPlayerIdsMock: vi.fn(),
    applySubstitutionMock: vi.fn(),
    applySaleMock: vi.fn(),
    setTeamCaptainMock: vi.fn(),
    hasCaptainMock: vi.fn(),
  };
});

vi.mock("@/db", () => ({ db: { transaction: transactionMock } }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/team/queries", () => ({
  lockTeamForUpdate: lockTeamForUpdateMock,
  getActiveRound: getActiveRoundMock,
  lockSlotForUpdate: lockSlotForUpdateMock,
  loadPlayersByIds: loadPlayersByIdsMock,
  loadRosteredPlayerIds: loadRosteredPlayerIdsMock,
  applySubstitution: applySubstitutionMock,
  applySale: applySaleMock,
  setTeamCaptain: setTeamCaptainMock,
  hasCaptain: hasCaptainMock,
}));

import {
  sellPlayer,
  setCaptain,
  substitutePlayer,
} from "@/app/(app)/my-team/actions";

const SLOT_ID = "11111111-1111-4111-8111-111111111111";
const OUTGOING_ID = "22222222-2222-4222-8222-222222222222";
const INCOMING_ID = "33333333-3333-4333-8333-333333333333";

const TEAM = { id: "team-1", userId: "user-1", balanceCents: 10_000 };
const OPEN_ROUND = {
  id: "round-1",
  marketOpensAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  marketClosesAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
};
const CLOSED_ROUND = {
  id: "round-1",
  marketOpensAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
  marketClosesAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
};
const SLOT = {
  id: SLOT_ID,
  fantasyTeamId: TEAM.id,
  playerId: OUTGOING_ID,
  position: 1,
  captain: false,
};
const OUTGOING_ROW = {
  id: OUTGOING_ID,
  nickname: "Derke",
  team: "FNATIC",
  agent: "Raze",
  role: "Duelista" as const,
  priceCents: 4000,
  score: 15.8,
  active: true,
  availability: "available" as const,
  availabilityNote: null,
};
const INCOMING_ROW = {
  id: INCOMING_ID,
  nickname: "TenZ",
  team: "SENTINELS",
  agent: "Jett",
  role: "Duelista" as const,
  priceCents: 3000,
  score: 18.2,
  active: true,
  availability: "available" as const,
  availabilityNote: null,
};

const VALID_INPUT = {
  slotId: SLOT_ID,
  outgoingPlayerId: OUTGOING_ID,
  incomingPlayerId: INCOMING_ID,
};

/** Configura o caminho feliz; cada teste sobrescreve o que precisa bloquear. */
function arrangeHappyPath() {
  getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
  lockTeamForUpdateMock.mockResolvedValue(TEAM);
  getActiveRoundMock.mockResolvedValue(OPEN_ROUND);
  lockSlotForUpdateMock.mockResolvedValue(SLOT);
  loadPlayersByIdsMock.mockResolvedValue([OUTGOING_ROW, INCOMING_ROW]);
  loadRosteredPlayerIdsMock.mockResolvedValue([OUTGOING_ID]);
  hasCaptainMock.mockResolvedValue(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  transactionMock.mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) => cb(txStub),
  );
  arrangeHappyPath();
});

describe("substitutePlayer", () => {
  it("sem sessão: recusa antes de abrir transação", async () => {
    getSessionMock.mockResolvedValue(null);

    const result = await substitutePlayer(VALID_INPUT);

    expect(result?.serverError).toBe("Sua sessão expirou. Entre novamente.");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("mercado fechado: bloqueia com a mensagem correspondente", async () => {
    getActiveRoundMock.mockResolvedValue(CLOSED_ROUND);

    const result = await substitutePlayer(VALID_INPUT);

    expect(result?.serverError).toBe("A janela de mercado está fechada.");
    expect(applySubstitutionMock).not.toHaveBeenCalled();
  });

  it("vaga de outro time: a trava não encontra a vaga e recusa", async () => {
    lockSlotForUpdateMock.mockResolvedValue(null);

    const result = await substitutePlayer(VALID_INPUT);

    expect(result?.serverError).toBe(
      "Essa vaga mudou enquanto você decidia. Recarregue a página.",
    );
    expect(applySubstitutionMock).not.toHaveBeenCalled();
  });

  it("função diferente: não bloqueia — qualquer função pode ocupar a vaga", async () => {
    loadPlayersByIdsMock.mockResolvedValue([
      OUTGOING_ROW,
      { ...INCOMING_ROW, role: "Sentinela" as const },
    ]);

    const result = await substitutePlayer(VALID_INPUT);

    expect(result?.data).toEqual({ success: true });
    expect(applySubstitutionMock).toHaveBeenCalled();
  });

  it("saldo insuficiente: bloqueia com a mensagem correspondente", async () => {
    lockTeamForUpdateMock.mockResolvedValue({ ...TEAM, balanceCents: 0 });
    loadPlayersByIdsMock.mockResolvedValue([
      OUTGOING_ROW,
      { ...INCOMING_ROW, priceCents: 1_000_000 },
    ]);

    const result = await substitutePlayer(VALID_INPUT);

    expect(result?.serverError).toBe(
      "Saldo insuficiente para esta contratação.",
    );
    expect(applySubstitutionMock).not.toHaveBeenCalled();
  });

  it("sucesso: aplica a substituição com o saldo correto e revalida a página", async () => {
    const result = await substitutePlayer(VALID_INPUT);

    expect(result?.data).toEqual({ success: true });
    expect(applySubstitutionMock).toHaveBeenCalledWith(txStub, {
      teamId: TEAM.id,
      slotId: SLOT_ID,
      incomingPlayerId: INCOMING_ID,
      outgoingPlayerId: OUTGOING_ID,
      roundId: OPEN_ROUND.id,
      outPriceCents: OUTGOING_ROW.priceCents,
      inPriceCents: INCOMING_ROW.priceCents,
      // TEAM.balanceCents (10_000) - (3000 - 4000)
      balanceAfterCents: 11_000,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/my-team");
  });
});

describe("substitutePlayer — vaga vazia (outgoingPlayerId null)", () => {
  const EMPTY_SLOT = { ...SLOT, playerId: null };
  const EMPTY_INPUT = {
    slotId: SLOT_ID,
    outgoingPlayerId: null,
    incomingPlayerId: INCOMING_ID,
  };

  beforeEach(() => {
    lockSlotForUpdateMock.mockResolvedValue(EMPTY_SLOT);
    loadPlayersByIdsMock.mockResolvedValue([INCOMING_ROW]);
    loadRosteredPlayerIdsMock.mockResolvedValue([]);
  });

  it("vaga já preenchida por outra aba: recusa", async () => {
    lockSlotForUpdateMock.mockResolvedValue(SLOT); // playerId != null

    const result = await substitutePlayer(EMPTY_INPUT);

    expect(result?.serverError).toBe(
      "Essa vaga mudou enquanto você decidia. Recarregue a página.",
    );
    expect(applySubstitutionMock).not.toHaveBeenCalled();
  });

  it("mercado fechado: bloqueia com a mensagem correspondente", async () => {
    getActiveRoundMock.mockResolvedValue(CLOSED_ROUND);

    const result = await substitutePlayer(EMPTY_INPUT);

    expect(result?.serverError).toBe("A janela de mercado está fechada.");
    expect(applySubstitutionMock).not.toHaveBeenCalled();
  });

  it("sucesso: contrata pelo preço cheio, sem crédito de venda, e marca capitão automaticamente", async () => {
    hasCaptainMock.mockResolvedValue(false);

    const result = await substitutePlayer(EMPTY_INPUT);

    expect(result?.data).toEqual({ success: true });
    expect(applySubstitutionMock).toHaveBeenCalledWith(txStub, {
      teamId: TEAM.id,
      slotId: SLOT_ID,
      incomingPlayerId: INCOMING_ID,
      outgoingPlayerId: null,
      roundId: OPEN_ROUND.id,
      outPriceCents: 0,
      inPriceCents: INCOMING_ROW.priceCents,
      // TEAM.balanceCents (10_000) - 3000
      balanceAfterCents: 7000,
    });
    expect(setTeamCaptainMock).toHaveBeenCalledWith(txStub, TEAM.id, SLOT_ID);
    expect(revalidatePathMock).toHaveBeenCalledWith("/my-team");
  });

  it("time já tem capitão: não mexe na braçadeira", async () => {
    hasCaptainMock.mockResolvedValue(true);

    await substitutePlayer(EMPTY_INPUT);

    expect(applySubstitutionMock).toHaveBeenCalled();
    expect(setTeamCaptainMock).not.toHaveBeenCalled();
  });
});

describe("setCaptain", () => {
  const CAPTAIN_INPUT = { slotId: SLOT_ID };

  it("sem sessão: recusa antes de abrir transação", async () => {
    getSessionMock.mockResolvedValue(null);

    const result = await setCaptain(CAPTAIN_INPUT);

    expect(result?.serverError).toBe("Sua sessão expirou. Entre novamente.");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("mercado fechado: bloqueia com a mensagem correspondente", async () => {
    getActiveRoundMock.mockResolvedValue(CLOSED_ROUND);

    const result = await setCaptain(CAPTAIN_INPUT);

    expect(result?.serverError).toBe("A janela de mercado está fechada.");
    expect(setTeamCaptainMock).not.toHaveBeenCalled();
  });

  it("vaga de outro time: a trava não encontra a vaga e recusa", async () => {
    lockSlotForUpdateMock.mockResolvedValue(null);

    const result = await setCaptain(CAPTAIN_INPUT);

    expect(result?.serverError).toBe(
      "Essa vaga não tem jogador para ser capitão.",
    );
    expect(setTeamCaptainMock).not.toHaveBeenCalled();
  });

  it("vaga vazia: recusa por não ter jogador para ser capitão", async () => {
    lockSlotForUpdateMock.mockResolvedValue({ ...SLOT, playerId: null });

    const result = await setCaptain(CAPTAIN_INPUT);

    expect(result?.serverError).toBe(
      "Essa vaga não tem jogador para ser capitão.",
    );
    expect(setTeamCaptainMock).not.toHaveBeenCalled();
  });

  it("já é capitão: não chama setTeamCaptain, mas ainda responde com sucesso", async () => {
    lockSlotForUpdateMock.mockResolvedValue({ ...SLOT, captain: true });

    const result = await setCaptain(CAPTAIN_INPUT);

    expect(result?.data).toEqual({ success: true });
    expect(setTeamCaptainMock).not.toHaveBeenCalled();
  });

  it("sucesso: move a braçadeira para a vaga e revalida a página", async () => {
    const result = await setCaptain(CAPTAIN_INPUT);

    expect(result?.data).toEqual({ success: true });
    expect(setTeamCaptainMock).toHaveBeenCalledWith(txStub, TEAM.id, SLOT_ID);
    expect(revalidatePathMock).toHaveBeenCalledWith("/my-team");
  });
});

describe("sellPlayer", () => {
  const SELL_INPUT = { slotId: SLOT_ID, outgoingPlayerId: OUTGOING_ID };

  it("sem sessão: recusa antes de abrir transação", async () => {
    getSessionMock.mockResolvedValue(null);

    const result = await sellPlayer(SELL_INPUT);

    expect(result?.serverError).toBe("Sua sessão expirou. Entre novamente.");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("mercado fechado: bloqueia com a mensagem correspondente", async () => {
    getActiveRoundMock.mockResolvedValue(CLOSED_ROUND);

    const result = await sellPlayer(SELL_INPUT);

    expect(result?.serverError).toBe("A janela de mercado está fechada.");
    expect(applySaleMock).not.toHaveBeenCalled();
  });

  it("vaga mudou (jogador de saída não bate): recusa", async () => {
    lockSlotForUpdateMock.mockResolvedValue({ ...SLOT, playerId: INCOMING_ID });

    const result = await sellPlayer(SELL_INPUT);

    expect(result?.serverError).toBe(
      "Essa vaga mudou enquanto você decidia. Recarregue a página.",
    );
    expect(applySaleMock).not.toHaveBeenCalled();
  });

  it("sucesso mesmo com saldo zerado: credita o preço cheio e revalida a página", async () => {
    lockTeamForUpdateMock.mockResolvedValue({ ...TEAM, balanceCents: 0 });

    const result = await sellPlayer(SELL_INPUT);

    expect(result?.data).toEqual({ success: true });
    expect(applySaleMock).toHaveBeenCalledWith(txStub, {
      teamId: TEAM.id,
      slotId: SLOT_ID,
      outgoingPlayerId: OUTGOING_ID,
      roundId: OPEN_ROUND.id,
      outPriceCents: OUTGOING_ROW.priceCents,
      balanceAfterCents: OUTGOING_ROW.priceCents,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/my-team");
  });
});
