import { beforeEach, describe, expect, it, vi } from "vitest";

// Padrão de `app/(app)/profile/actions.test.ts`: mocka `@/lib/auth`,
// `next/headers` e a primitiva nomeada de `lib/tour/queries.ts` — nenhuma
// cadeia `update().set().where()` montada à mão no teste.
const { getSessionMock, markTourCompletedMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  markTourCompletedMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/tour/queries", () => ({
  markTourCompleted: markTourCompletedMock,
}));

import { completeTour } from "@/app/(app)/actions";

const USER_ID = "user-a";

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ user: { id: USER_ID } });
});

describe("completeTour", () => {
  it("com sessão, marca o tour como concluído para o usuário logado", async () => {
    const result = await completeTour();

    expect(markTourCompletedMock).toHaveBeenCalledWith(USER_ID);
    expect(result?.data).toEqual({ success: true });
  });

  it("sem sessão, não chama a query e devolve o erro de sessão expirada", async () => {
    getSessionMock.mockResolvedValue(null);

    const result = await completeTour();

    expect(markTourCompletedMock).not.toHaveBeenCalled();
    expect(result?.serverError).toBe("Sua sessão expirou. Entre novamente.");
  });
});
