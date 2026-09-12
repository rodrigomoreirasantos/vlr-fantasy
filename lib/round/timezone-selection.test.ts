import { beforeEach, describe, expect, it, vi } from "vitest";

// Padrão de `app/(app)/profile/actions.test.ts`: mocka `next/headers` direto,
// sem montar um `Headers`/`RequestCookies` de verdade.
const { cookiesMock, headersMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  headersMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
  headers: headersMock,
}));

const { resolveTimezone } = await import("@/lib/round/timezone-selection");

function cookieJar(value?: string) {
  return { get: () => (value === undefined ? undefined : { value }) };
}

function headerBag(value?: string) {
  return { get: () => value ?? null };
}

describe("resolveTimezone", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    headersMock.mockReset();
  });

  it("o cookie do navegador vence o header da Vercel", async () => {
    cookiesMock.mockResolvedValue(cookieJar("Asia/Tokyo"));
    headersMock.mockResolvedValue(headerBag("America/Sao_Paulo"));

    expect(await resolveTimezone()).toBe("Asia/Tokyo");
  });

  it("sem cookie, vale o header da Vercel", async () => {
    cookiesMock.mockResolvedValue(cookieJar(undefined));
    headersMock.mockResolvedValue(headerBag("Asia/Tokyo"));

    expect(await resolveTimezone()).toBe("Asia/Tokyo");
  });

  it("cookie inválido cai no header — não direto no fallback", async () => {
    cookiesMock.mockResolvedValue(cookieJar("Foo/Bar"));
    headersMock.mockResolvedValue(headerBag("Asia/Tokyo"));

    expect(await resolveTimezone()).toBe("Asia/Tokyo");
  });

  it("sem cookie e sem header (dev local), cai no fallback", async () => {
    cookiesMock.mockResolvedValue(cookieJar(undefined));
    headersMock.mockResolvedValue(headerBag(undefined));

    expect(await resolveTimezone()).toBe("America/Sao_Paulo");
  });

  it("header inválido também cai no fallback", async () => {
    cookiesMock.mockResolvedValue(cookieJar(undefined));
    headersMock.mockResolvedValue(headerBag("Foo/Bar"));

    expect(await resolveTimezone()).toBe("America/Sao_Paulo");
  });
});
