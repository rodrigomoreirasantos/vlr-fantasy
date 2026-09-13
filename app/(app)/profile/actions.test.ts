import { beforeEach, describe, expect, it, vi } from "vitest";

// Padrão de `app/(app)/ranking/actions.test.ts`: mocka as primitivas
// nomeadas de `lib/team/queries.ts`, `lib/championship/queries.ts` e
// `lib/friendship/queries.ts` e, do `@/db`, só a `transaction` — nenhuma
// cadeia `select().from().where()` montada à mão no teste.
const {
  transactionMock,
  txStub,
  getSessionMock,
  revalidatePathMock,
  updateTeamNameForUserMock,
  updateTeamCrestForUserMock,
  findUserByUsernameMock,
  inviteUserToChampionshipMock,
  findFriendshipByPairMock,
  lockFriendshipForUpdateMock,
  upsertFriendRequestMock,
  updateFriendshipStatusMock,
  deleteFriendshipMock,
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
    updateTeamNameForUserMock: vi.fn(),
    updateTeamCrestForUserMock: vi.fn(),
    findUserByUsernameMock: vi.fn(),
    inviteUserToChampionshipMock: vi.fn(),
    findFriendshipByPairMock: vi.fn(),
    lockFriendshipForUpdateMock: vi.fn(),
    upsertFriendRequestMock: vi.fn(),
    updateFriendshipStatusMock: vi.fn(),
    deleteFriendshipMock: vi.fn(),
  };
});

vi.mock("@/db", () => ({ db: { transaction: transactionMock } }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/team/queries", () => ({
  updateTeamNameForUser: updateTeamNameForUserMock,
  updateTeamCrestForUser: updateTeamCrestForUserMock,
}));
vi.mock("@/lib/championship/queries", () => ({
  findUserByUsername: findUserByUsernameMock,
  inviteUserToChampionship: inviteUserToChampionshipMock,
}));
vi.mock("@/lib/friendship/queries", () => ({
  findFriendshipByPair: findFriendshipByPairMock,
  lockFriendshipForUpdate: lockFriendshipForUpdateMock,
  upsertFriendRequest: upsertFriendRequestMock,
  updateFriendshipStatus: updateFriendshipStatusMock,
  deleteFriendship: deleteFriendshipMock,
}));

import {
  inviteFriendToChampionship,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
  updateTeamIdentity,
} from "@/app/(app)/profile/actions";

const USER_ID = "user-a";
const OTHER_USER_ID = "user-b";
const THIRD_USER_ID = "user-c";
const FRIENDSHIP_ID = "11111111-1111-4111-8111-111111111111";
const CHAMPIONSHIP_ID = "22222222-2222-4222-8222-222222222222";

/** Erro que o `pg` levanta ao violar uma constraint `UNIQUE`. */
function uniqueViolation(): Error & { code: string } {
  return Object.assign(
    new Error('duplicate key value violates unique constraint "x"'),
    { code: "23505" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  transactionMock.mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) => cb(txStub),
  );
  getSessionMock.mockResolvedValue({ user: { id: USER_ID } });
});

describe("updateTeamIdentity", () => {
  const CREST_INPUT = {
    shape: "diamond",
    symbol: "fireball",
    background: "cyan",
    foreground: "white",
    border: "amber",
  } as const;

  it("sucesso: normaliza o nome e escreve nome + brasão do próprio usuário, na mesma transação", async () => {
    const result = await updateTeamIdentity({
      name: "  Sentinels   BR  ",
      ...CREST_INPUT,
    });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(updateTeamNameForUserMock).toHaveBeenCalledWith(
      txStub,
      USER_ID,
      "Sentinels BR",
    );
    expect(updateTeamCrestForUserMock).toHaveBeenCalledWith(
      txStub,
      USER_ID,
      CREST_INPUT,
    );
    expect(result?.data).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/profile");
  });

  it("violação de unicidade do nome: traduz para a mensagem pt-BR", async () => {
    updateTeamNameForUserMock.mockRejectedValue(uniqueViolation());

    const result = await updateTeamIdentity({
      name: "Sentinels BR",
      ...CREST_INPUT,
    });

    expect(result?.serverError).toBe(
      "Já existe um time com esse nome. Escolha outro.",
    );
  });

  it("qualquer outro erro sobe (mensagem genérica, não a de nome duplicado)", async () => {
    updateTeamNameForUserMock.mockRejectedValue(new Error("conexão perdida"));

    const result = await updateTeamIdentity({
      name: "Sentinels BR",
      ...CREST_INPUT,
    });

    expect(result?.serverError).not.toBe(
      "Já existe um time com esse nome. Escolha outro.",
    );
  });
});

describe("sendFriendRequest", () => {
  it("login inexistente: recusa", async () => {
    findUserByUsernameMock.mockResolvedValue(null);

    const result = await sendFriendRequest({ username: "@naoexiste" });

    expect(findUserByUsernameMock).toHaveBeenCalledWith(txStub, "naoexiste");
    expect(result?.serverError).toBe(
      "Não encontramos ninguém com o login @naoexiste.",
    );
    expect(upsertFriendRequestMock).not.toHaveBeenCalled();
  });

  it("autopedido: recusa", async () => {
    findUserByUsernameMock.mockResolvedValue({ id: USER_ID });

    const result = await sendFriendRequest({ username: "@propriologin" });

    expect(result?.serverError).toBe("Você não pode adicionar a si mesmo.");
    expect(upsertFriendRequestMock).not.toHaveBeenCalled();
  });

  it("pedido repetido (pending): recusa", async () => {
    findUserByUsernameMock.mockResolvedValue({ id: OTHER_USER_ID });
    upsertFriendRequestMock.mockResolvedValue(null);
    findFriendshipByPairMock.mockResolvedValue({ status: "pending" });

    const result = await sendFriendRequest({ username: "@amigo" });

    expect(result?.serverError).toBe(
      "Você já enviou um pedido para essa pessoa.",
    );
  });

  it("já são amigos (accepted): recusa", async () => {
    findUserByUsernameMock.mockResolvedValue({ id: OTHER_USER_ID });
    upsertFriendRequestMock.mockResolvedValue(null);
    findFriendshipByPairMock.mockResolvedValue({ status: "accepted" });

    const result = await sendFriendRequest({ username: "@amigo" });

    expect(result?.serverError).toBe("Vocês já são amigos.");
  });

  it("sucesso: envia o pedido com o par canônico (ou reativa um declined)", async () => {
    findUserByUsernameMock.mockResolvedValue({ id: OTHER_USER_ID });
    upsertFriendRequestMock.mockResolvedValue({ id: FRIENDSHIP_ID });

    const result = await sendFriendRequest({ username: "@amigo" });

    expect(upsertFriendRequestMock).toHaveBeenCalledWith(txStub, {
      pair:
        USER_ID < OTHER_USER_ID
          ? { userAId: USER_ID, userBId: OTHER_USER_ID }
          : { userAId: OTHER_USER_ID, userBId: USER_ID },
      requesterId: USER_ID,
    });
    expect(result?.data).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/profile");
  });
});

describe("respondToFriendRequest", () => {
  it("pedido de terceiros (usuário não é parte do par): recusa", async () => {
    lockFriendshipForUpdateMock.mockResolvedValue({
      id: FRIENDSHIP_ID,
      userAId: OTHER_USER_ID,
      userBId: THIRD_USER_ID,
      requesterId: OTHER_USER_ID,
      status: "pending",
    });

    const result = await respondToFriendRequest({
      friendshipId: FRIENDSHIP_ID,
      accept: true,
    });

    expect(result?.serverError).toBe("Este pedido não é seu.");
    expect(updateFriendshipStatusMock).not.toHaveBeenCalled();
  });

  it("pedido inexistente: recusa", async () => {
    lockFriendshipForUpdateMock.mockResolvedValue(null);

    const result = await respondToFriendRequest({
      friendshipId: FRIENDSHIP_ID,
      accept: true,
    });

    expect(result?.serverError).toBe("Este pedido não é seu.");
  });

  it("o próprio pedido (usuário é o requesterId): recusa", async () => {
    lockFriendshipForUpdateMock.mockResolvedValue({
      id: FRIENDSHIP_ID,
      userAId: USER_ID,
      userBId: OTHER_USER_ID,
      requesterId: USER_ID,
      status: "pending",
    });

    const result = await respondToFriendRequest({
      friendshipId: FRIENDSHIP_ID,
      accept: true,
    });

    expect(result?.serverError).toBe(
      "Você não pode responder ao próprio pedido.",
    );
    expect(updateFriendshipStatusMock).not.toHaveBeenCalled();
  });

  it("pedido já respondido: recusa", async () => {
    lockFriendshipForUpdateMock.mockResolvedValue({
      id: FRIENDSHIP_ID,
      userAId: USER_ID,
      userBId: OTHER_USER_ID,
      requesterId: OTHER_USER_ID,
      status: "accepted",
    });

    const result = await respondToFriendRequest({
      friendshipId: FRIENDSHIP_ID,
      accept: true,
    });

    expect(result?.serverError).toBe("Este pedido já foi respondido.");
    expect(updateFriendshipStatusMock).not.toHaveBeenCalled();
  });

  it("aceitar: atualiza para accepted e revalida a página", async () => {
    lockFriendshipForUpdateMock.mockResolvedValue({
      id: FRIENDSHIP_ID,
      userAId: USER_ID,
      userBId: OTHER_USER_ID,
      requesterId: OTHER_USER_ID,
      status: "pending",
    });

    const result = await respondToFriendRequest({
      friendshipId: FRIENDSHIP_ID,
      accept: true,
    });

    expect(updateFriendshipStatusMock).toHaveBeenCalledWith(txStub, {
      id: FRIENDSHIP_ID,
      status: "accepted",
    });
    expect(result?.data).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/profile");
  });
});

describe("removeFriend", () => {
  it("amizade de terceiros (usuário não é parte do par): recusa", async () => {
    lockFriendshipForUpdateMock.mockResolvedValue({
      id: FRIENDSHIP_ID,
      userAId: OTHER_USER_ID,
      userBId: THIRD_USER_ID,
    });

    const result = await removeFriend({ friendshipId: FRIENDSHIP_ID });

    expect(result?.serverError).toBe("Esta amizade não é sua.");
    expect(deleteFriendshipMock).not.toHaveBeenCalled();
  });

  it("sucesso: remove a amizade e revalida a página", async () => {
    lockFriendshipForUpdateMock.mockResolvedValue({
      id: FRIENDSHIP_ID,
      userAId: USER_ID,
      userBId: OTHER_USER_ID,
    });

    const result = await removeFriend({ friendshipId: FRIENDSHIP_ID });

    expect(deleteFriendshipMock).toHaveBeenCalledWith(txStub, FRIENDSHIP_ID);
    expect(result?.data).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/profile");
  });
});

describe("inviteFriendToChampionship", () => {
  const INPUT = {
    championshipId: CHAMPIONSHIP_ID,
    friendUserId: OTHER_USER_ID,
  };

  it("não-dono: traduz o motivo de bloqueio para a mensagem pt-BR", async () => {
    inviteUserToChampionshipMock.mockResolvedValue({
      ok: false,
      reason: "not_owner",
    });

    const result = await inviteFriendToChampionship(INPUT);

    expect(inviteUserToChampionshipMock).toHaveBeenCalledWith(txStub, {
      championshipId: CHAMPIONSHIP_ID,
      ownerId: USER_ID,
      targetUserId: OTHER_USER_ID,
    });
    expect(result?.serverError).toBe(
      "Só quem criou o campeonato pode convidar.",
    );
  });

  it("sucesso: convida e revalida perfil e ranking", async () => {
    inviteUserToChampionshipMock.mockResolvedValue({ ok: true });

    const result = await inviteFriendToChampionship(INPUT);

    expect(result?.data).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/profile");
    expect(revalidatePathMock).toHaveBeenCalledWith("/ranking");
  });
});
