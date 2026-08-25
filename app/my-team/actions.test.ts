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
} = vi.hoisted(() => {
  const txStub = Symbol("tx");
  const transactionMock = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(txStub));
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
  };
});

vi.mock("@/db", () => ({ db: { transaction: transactionMock } }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: getSessionMock } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/team/queries", () => ({
  lockTeamForUpdate: lockTeamForUpdateMock,
  getActiveRound: getActiveRoundMock,
  lockSlotForUpdate: lockSlotForUpdateMock,
  loadPlayersByIds: loadPlayersByIdsMock,
  loadRosteredPlayerIds: loadRosteredPlayerIdsMock,
  applySubstitution: applySubstitutionMock,
}));

import { substitutePlayer } from "@/app/my-team/actions";

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
const SLOT = { id: SLOT_ID, fantasyTeamId: TEAM.id, playerId: OUTGOING_ID, position: 1, captain: false };
const OUTGOING_ROW = {
  id: OUTGOING_ID,
  nickname: "Derke",
  team: "FNATIC",
  agent: "Raze",
  role: "Duelista" as const,
  priceCents: 4000,
  score: 15.8,
  active: true,
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
}

beforeEach(() => {
  vi.clearAllMocks();
  transactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txStub));
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

  it("função diferente: bloqueia mencionando a função exigida", async () => {
    loadPlayersByIdsMock.mockResolvedValue([
      OUTGOING_ROW,
      { ...INCOMING_ROW, role: "Sentinela" as const },
    ]);

    const result = await substitutePlayer(VALID_INPUT);

    expect(result?.serverError).toBe(
      "Só é possível substituir por outro Duelista.",
    );
    expect(applySubstitutionMock).not.toHaveBeenCalled();
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
