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
  lockTeamForSlotMock,
  resolveMarketScopeMock,
  getActiveRoundMock,
  lockSlotForUpdateMock,
  loadPlayersByIdsMock,
  loadRosteredPlayerIdsMock,
  applySubstitutionMock,
  applySaleMock,
  setTeamCaptainMock,
  hasCaptainMock,
  listMarketLockMatchesMock,
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
    lockTeamForSlotMock: vi.fn(),
    resolveMarketScopeMock: vi.fn(),
    getActiveRoundMock: vi.fn(),
    lockSlotForUpdateMock: vi.fn(),
    loadPlayersByIdsMock: vi.fn(),
    loadRosteredPlayerIdsMock: vi.fn(),
    applySubstitutionMock: vi.fn(),
    applySaleMock: vi.fn(),
    setTeamCaptainMock: vi.fn(),
    hasCaptainMock: vi.fn(),
    listMarketLockMatchesMock: vi.fn(),
  };
});

vi.mock("@/db", () => ({ db: { transaction: transactionMock } }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/round/queries", () => ({
  listMarketLockMatches: listMarketLockMatchesMock,
}));
vi.mock("@/lib/team/queries", () => ({
  lockTeamForSlot: lockTeamForSlotMock,
  resolveMarketScope: resolveMarketScopeMock,
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

const TEAM = {
  id: "team-1",
  userId: "user-1",
  region: "americas" as const,
  balanceCents: 10_000,
};
const AMERICAS_SCOPE = { kind: "region" as const, region: "americas" as const };
const OPEN_ROUND = {
  id: "round-1",
  marketOpensAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  marketClosesAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
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
  region: "emea" as const,
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
  region: "americas" as const,
};

const VALID_INPUT = {
  slotId: SLOT_ID,
  outgoingPlayerId: OUTGOING_ID,
  incomingPlayerId: INCOMING_ID,
};

/** Configura o caminho feliz; cada teste sobrescreve o que precisa bloquear. */
function arrangeHappyPath() {
  getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
  lockTeamForSlotMock.mockResolvedValue(TEAM);
  resolveMarketScopeMock.mockResolvedValue(AMERICAS_SCOPE);
  getActiveRoundMock.mockResolvedValue(OPEN_ROUND);
  lockSlotForUpdateMock.mockResolvedValue(SLOT);
  loadPlayersByIdsMock.mockResolvedValue([OUTGOING_ROW, INCOMING_ROW]);
  loadRosteredPlayerIdsMock.mockResolvedValue([OUTGOING_ID]);
  hasCaptainMock.mockResolvedValue(true);
  // Nenhum jogo hoje: a trava do dia não fecha nada.
  listMarketLockMatchesMock.mockResolvedValue([]);
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

  it("sem rodada ativa: bloqueia com a mensagem correspondente", async () => {
    getActiveRoundMock.mockResolvedValue(undefined);

    const result = await substitutePlayer(VALID_INPUT);

    expect(result?.serverError).toBe("Não há rodada ativa no momento.");
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
    lockTeamForSlotMock.mockResolvedValue({ ...TEAM, balanceCents: 0 });
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

  it("jogador de outra região: bloqueia mesmo com saldo sobrando", async () => {
    // `outgoing` (FNATIC/EMEA) sai, mas quem entra também é de EMEA — o time
    // é de Americas (`AMERICAS_SCOPE`), então o candidato é recusado mesmo
    // sobrando saldo de sobra para a compra.
    loadPlayersByIdsMock.mockResolvedValue([
      OUTGOING_ROW,
      { ...INCOMING_ROW, region: "emea" as const, priceCents: 100 },
    ]);

    const result = await substitutePlayer(VALID_INPUT);

    expect(result?.serverError).toBe(
      "Este jogador não atua na região deste time.",
    );
    expect(applySubstitutionMock).not.toHaveBeenCalled();
  });

  it("resolve o escopo do mercado **dentro** da transação", async () => {
    // Sem o `tx`, `resolveMarketScope` cairia no client global e tiraria uma
    // segunda conexão do pool com esta transação aberta — com concorrência
    // suficiente, o pool trava inteiro.
    await substitutePlayer(VALID_INPUT);

    expect(resolveMarketScopeMock).toHaveBeenCalledWith(TEAM.region, txStub);
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

  it("sem rodada ativa: bloqueia com a mensagem correspondente", async () => {
    getActiveRoundMock.mockResolvedValue(undefined);

    const result = await substitutePlayer(EMPTY_INPUT);

    expect(result?.serverError).toBe("Não há rodada ativa no momento.");
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

  it("sem rodada ativa: bloqueia com a mensagem correspondente", async () => {
    getActiveRoundMock.mockResolvedValue(undefined);

    const result = await setCaptain(CAPTAIN_INPUT);

    expect(result?.serverError).toBe("Não há rodada ativa no momento.");
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

  it("sem rodada ativa: bloqueia com a mensagem correspondente", async () => {
    getActiveRoundMock.mockResolvedValue(undefined);

    const result = await sellPlayer(SELL_INPUT);

    expect(result?.serverError).toBe("Não há rodada ativa no momento.");
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
    lockTeamForSlotMock.mockResolvedValue({ ...TEAM, balanceCents: 0 });

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

  it("vende um jogador fora da região sem bloquear — decisão 7 do plano", async () => {
    // OUTGOING_ROW já é EMEA e o time é Americas: a venda não olha `scope`.
    const result = await sellPlayer(SELL_INPUT);

    expect(result?.data).toEqual({ success: true });
    expect(applySaleMock).toHaveBeenCalled();
  });
});

/** Uma partida de hoje cujo mercado já fechou — a trava do dia em ação. */
function matchTodayAlreadyClosed(event: string, teamA: string, teamB: string) {
  const kickoff = new Date(Date.now() + 30 * 60 * 1000);
  return [
    {
      id: "match-hoje",
      teamA,
      teamB,
      event,
      // Começa em 30 min: o mercado fechou há meia hora.
      scheduledAt: kickoff,
      status: "upcoming" as const,
      scoreA: null,
      scoreB: null,
    },
  ];
}

describe("a trava do dia", () => {
  it("barra a contratação de quem joga em campeonato já fechado hoje", async () => {
    listMarketLockMatchesMock.mockResolvedValue(
      matchTodayAlreadyClosed("VCT Americas", "SENTINELS", "NRG"),
    );

    const result = await substitutePlayer(VALID_INPUT);

    expect(result?.serverError).toBe(
      "O mercado deste campeonato já fechou — ele joga hoje.",
    );
    expect(applySubstitutionMock).not.toHaveBeenCalled();
  });

  it("barra a venda de quem joga em campeonato já fechado hoje", async () => {
    loadPlayersByIdsMock.mockResolvedValue([OUTGOING_ROW]);
    listMarketLockMatchesMock.mockResolvedValue(
      matchTodayAlreadyClosed("VCT EMEA", OUTGOING_ROW.team, "FNATIC"),
    );

    const result = await sellPlayer({
      slotId: SLOT_ID,
      outgoingPlayerId: OUTGOING_ID,
    });

    expect(result?.serverError).toBe(
      "O mercado deste campeonato já fechou — ele joga hoje.",
    );
    expect(applySaleMock).not.toHaveBeenCalled();
  });

  it("um campeonato fechado não tranca os outros", async () => {
    listMarketLockMatchesMock.mockResolvedValue(
      matchTodayAlreadyClosed("VCT Pacific", "DRX", "Gen.G"),
    );

    const result = await substitutePlayer(VALID_INPUT);

    expect(result?.data).toEqual({ success: true });
  });

  it("a braçadeira também respeita a trava", async () => {
    loadPlayersByIdsMock.mockResolvedValue([OUTGOING_ROW]);
    lockSlotForUpdateMock.mockResolvedValue({
      id: SLOT_ID,
      playerId: OUTGOING_ID,
      captain: false,
    });
    listMarketLockMatchesMock.mockResolvedValue(
      matchTodayAlreadyClosed("VCT EMEA", OUTGOING_ROW.team, "FNATIC"),
    );

    const result = await setCaptain({ slotId: SLOT_ID });

    expect(result?.serverError).toBe(
      "O mercado deste campeonato já fechou — ele joga hoje.",
    );
    expect(setTeamCaptainMock).not.toHaveBeenCalled();
  });
});
