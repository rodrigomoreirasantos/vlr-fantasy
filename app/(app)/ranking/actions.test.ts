import { beforeEach, describe, expect, it, vi } from "vitest";

// Padrão de `app/my-team/actions.test.ts`: mocka as primitivas nomeadas de
// `lib/championship/queries.ts` e, do `@/db`, só a `transaction` — nenhuma
// cadeia `select().from().where()` é montada à mão no teste.
const {
  transactionMock,
  txStub,
  getSessionMock,
  revalidatePathMock,
  insertChampionshipWithOwnerMock,
  findUserByUsernameMock,
  inviteUserToChampionshipMock,
  lockMembershipForUpdateMock,
  updateMembershipStatusMock,
  ensureFriendshipMock,
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
    insertChampionshipWithOwnerMock: vi.fn(),
    findUserByUsernameMock: vi.fn(),
    inviteUserToChampionshipMock: vi.fn(),
    lockMembershipForUpdateMock: vi.fn(),
    updateMembershipStatusMock: vi.fn(),
    ensureFriendshipMock: vi.fn(),
  };
});

vi.mock("@/db", () => ({ db: { transaction: transactionMock } }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/championship/queries", () => ({
  insertChampionshipWithOwner: insertChampionshipWithOwnerMock,
  findUserByUsername: findUserByUsernameMock,
  inviteUserToChampionship: inviteUserToChampionshipMock,
  lockMembershipForUpdate: lockMembershipForUpdateMock,
  updateMembershipStatus: updateMembershipStatusMock,
}));
vi.mock("@/lib/friendship/queries", () => ({
  ensureFriendship: ensureFriendshipMock,
}));

import {
  createChampionship,
  inviteMember,
  respondToInvite,
} from "@/app/(app)/ranking/actions";

const CHAMPIONSHIP_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_ID = "user-owner";
const TARGET_USER_ID = "user-target";

beforeEach(() => {
  vi.clearAllMocks();
  transactionMock.mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) => cb(txStub),
  );
  getSessionMock.mockResolvedValue({ user: { id: OWNER_ID } });
});

describe("createChampionship", () => {
  it("sem sessão: recusa antes de abrir transação", async () => {
    getSessionMock.mockResolvedValue(null);

    const result = await createChampionship({
      name: "Liga dos Cria",
      region: "americas",
    });

    expect(result?.serverError).toBe("Sua sessão expirou. Entre novamente.");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("sucesso: cria o campeonato com o dono e revalida a página", async () => {
    insertChampionshipWithOwnerMock.mockResolvedValue(CHAMPIONSHIP_ID);

    const result = await createChampionship({
      name: "Liga dos Cria",
      region: "americas",
    });

    expect(insertChampionshipWithOwnerMock).toHaveBeenCalledWith(txStub, {
      name: "Liga dos Cria",
      ownerId: OWNER_ID,
      region: "americas",
    });
    expect(result?.data).toEqual({ championshipId: CHAMPIONSHIP_ID });
    expect(revalidatePathMock).toHaveBeenCalledWith("/ranking");
  });
});

describe("inviteMember", () => {
  const INPUT = { championshipId: CHAMPIONSHIP_ID, username: "@alvo" };

  it("login inexistente: recusa com o login normalizado na mensagem, sem chamar inviteUserToChampionship", async () => {
    findUserByUsernameMock.mockResolvedValue(null);

    const result = await inviteMember(INPUT);

    expect(findUserByUsernameMock).toHaveBeenCalledWith(txStub, "alvo");
    expect(result?.serverError).toBe(
      "Não encontramos ninguém com o login @alvo.",
    );
    expect(inviteUserToChampionshipMock).not.toHaveBeenCalled();
  });

  it("não-dono: traduz o motivo de bloqueio para a mensagem pt-BR", async () => {
    findUserByUsernameMock.mockResolvedValue({ id: TARGET_USER_ID });
    inviteUserToChampionshipMock.mockResolvedValue({
      ok: false,
      reason: "not_owner",
    });

    const result = await inviteMember(INPUT);

    expect(inviteUserToChampionshipMock).toHaveBeenCalledWith(txStub, {
      championshipId: CHAMPIONSHIP_ID,
      ownerId: OWNER_ID,
      targetUserId: TARGET_USER_ID,
    });
    expect(result?.serverError).toBe(
      "Só quem criou o campeonato pode convidar.",
    );
  });

  it("autoconvite: traduz o motivo de bloqueio para a mensagem pt-BR", async () => {
    findUserByUsernameMock.mockResolvedValue({ id: TARGET_USER_ID });
    inviteUserToChampionshipMock.mockResolvedValue({
      ok: false,
      reason: "self",
    });

    const result = await inviteMember(INPUT);

    expect(result?.serverError).toBe("Você já está neste campeonato.");
  });

  it("convite repetido: traduz o motivo de bloqueio para a mensagem pt-BR", async () => {
    findUserByUsernameMock.mockResolvedValue({ id: TARGET_USER_ID });
    inviteUserToChampionshipMock.mockResolvedValue({
      ok: false,
      reason: "already_invited",
    });

    const result = await inviteMember(INPUT);

    expect(result?.serverError).toBe("Esse jogador já foi convidado.");
  });

  it("já é membro: traduz o motivo de bloqueio para a mensagem pt-BR", async () => {
    findUserByUsernameMock.mockResolvedValue({ id: TARGET_USER_ID });
    inviteUserToChampionshipMock.mockResolvedValue({
      ok: false,
      reason: "already_member",
    });

    const result = await inviteMember(INPUT);

    expect(result?.serverError).toBe("Esse jogador já está no campeonato.");
  });

  it("sucesso: convida e revalida a página", async () => {
    findUserByUsernameMock.mockResolvedValue({ id: TARGET_USER_ID });
    inviteUserToChampionshipMock.mockResolvedValue({ ok: true });

    const result = await inviteMember(INPUT);

    expect(result?.data).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/ranking");
  });
});

describe("respondToInvite", () => {
  it("convite de outro usuário: recusa", async () => {
    lockMembershipForUpdateMock.mockResolvedValue({
      id: MEMBER_ID,
      userId: "outro-usuario",
      status: "pending",
    });

    const result = await respondToInvite({ memberId: MEMBER_ID, accept: true });

    expect(result?.serverError).toBe("Este convite não é seu.");
    expect(updateMembershipStatusMock).not.toHaveBeenCalled();
  });

  it("convite inexistente: recusa", async () => {
    lockMembershipForUpdateMock.mockResolvedValue(null);

    const result = await respondToInvite({ memberId: MEMBER_ID, accept: true });

    expect(result?.serverError).toBe("Este convite não é seu.");
  });

  it("convite já respondido: recusa", async () => {
    lockMembershipForUpdateMock.mockResolvedValue({
      id: MEMBER_ID,
      userId: OWNER_ID,
      status: "accepted",
    });

    const result = await respondToInvite({ memberId: MEMBER_ID, accept: true });

    expect(result?.serverError).toBe("Este convite já foi respondido.");
    expect(updateMembershipStatusMock).not.toHaveBeenCalled();
  });

  it("aceitar: atualiza para accepted e revalida a página", async () => {
    lockMembershipForUpdateMock.mockResolvedValue({
      id: MEMBER_ID,
      userId: OWNER_ID,
      status: "pending",
      invitedById: null,
    });

    const result = await respondToInvite({ memberId: MEMBER_ID, accept: true });

    expect(updateMembershipStatusMock).toHaveBeenCalledWith(txStub, {
      memberId: MEMBER_ID,
      status: "accepted",
    });
    expect(result?.data).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/ranking");
  });

  it("recusar: atualiza para declined", async () => {
    lockMembershipForUpdateMock.mockResolvedValue({
      id: MEMBER_ID,
      userId: OWNER_ID,
      status: "pending",
      invitedById: null,
    });

    await respondToInvite({ memberId: MEMBER_ID, accept: false });

    expect(updateMembershipStatusMock).toHaveBeenCalledWith(txStub, {
      memberId: MEMBER_ID,
      status: "declined",
    });
  });

  it("aceitar convite com convidante: cria a auto-amizade com o par canônico", async () => {
    lockMembershipForUpdateMock.mockResolvedValue({
      id: MEMBER_ID,
      userId: OWNER_ID,
      status: "pending",
      invitedById: TARGET_USER_ID,
    });

    await respondToInvite({ memberId: MEMBER_ID, accept: true });

    expect(ensureFriendshipMock).toHaveBeenCalledWith(
      txStub,
      OWNER_ID < TARGET_USER_ID
        ? { userAId: OWNER_ID, userBId: TARGET_USER_ID }
        : { userAId: TARGET_USER_ID, userBId: OWNER_ID },
    );
  });

  it("recusar convite com convidante: não cria amizade", async () => {
    lockMembershipForUpdateMock.mockResolvedValue({
      id: MEMBER_ID,
      userId: OWNER_ID,
      status: "pending",
      invitedById: TARGET_USER_ID,
    });

    await respondToInvite({ memberId: MEMBER_ID, accept: false });

    expect(ensureFriendshipMock).not.toHaveBeenCalled();
  });

  it("aceitar convite sem convidante (invitedById nulo): não chama ensureFriendship", async () => {
    lockMembershipForUpdateMock.mockResolvedValue({
      id: MEMBER_ID,
      userId: OWNER_ID,
      status: "pending",
      invitedById: null,
    });

    await respondToInvite({ memberId: MEMBER_ID, accept: true });

    expect(ensureFriendshipMock).not.toHaveBeenCalled();
  });
});
