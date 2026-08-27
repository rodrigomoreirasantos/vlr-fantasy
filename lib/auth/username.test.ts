import { describe, expect, it, vi } from "vitest";

import {
  assignUsernameWithRetry,
  generateUniqueUsername,
  isUniqueViolation,
  normalizeUsernameInput,
  slugifyUsername,
} from "@/lib/auth/username";

/** Erro que o `pg` levanta ao violar `user_username_unique`. */
function uniqueViolation(): Error & { code: string } {
  return Object.assign(
    new Error(
      'duplicate key value violates unique constraint "user_username_unique"',
    ),
    { code: "23505" },
  );
}

describe("slugifyUsername", () => {
  it("remove acentos e espaços, e vira minúsculas", () => {
    expect(slugifyUsername("Rodrigo Santos")).toBe("rodrigosantos");
    expect(slugifyUsername("João Ação")).toBe("joaoacao");
  });

  it("remove caracteres fora de [a-z0-9_.]", () => {
    expect(slugifyUsername("rodrigo!@#123")).toBe("rodrigo123");
  });

  it("corta em 20 caracteres", () => {
    const longo = "a".repeat(30);
    expect(slugifyUsername(longo)).toHaveLength(20);
  });

  it("usa o fallback quando sobra menos de 3 caracteres", () => {
    expect(slugifyUsername("!!")).toBe("jogador");
    expect(slugifyUsername("")).toBe("jogador");
  });

  it("preserva underline e ponto", () => {
    expect(slugifyUsername("rodrigo_santos.dev")).toBe("rodrigo_santos.dev");
  });
});

describe("generateUniqueUsername", () => {
  it("devolve o slug direto quando não há colisão", async () => {
    const exists = async () => false;
    expect(await generateUniqueUsername("Rodrigo", exists)).toBe("rodrigo");
  });

  it("tenta base2, base3 em caso de colisão", async () => {
    const taken = new Set(["rodrigo", "rodrigo2"]);
    const exists = async (u: string) => taken.has(u);
    expect(await generateUniqueUsername("Rodrigo", exists)).toBe("rodrigo3");
  });

  it("trunca a base para o sufixo caber em 20 caracteres", async () => {
    const base = "a".repeat(20);
    const taken = new Set([base]);
    const exists = async (u: string) => taken.has(u);
    const result = await generateUniqueUsername(base, exists);
    expect(result).toHaveLength(20);
    expect(result).toBe(`${"a".repeat(19)}2`);
  });
});

describe("isUniqueViolation", () => {
  it("reconhece o código 23505 do Postgres", () => {
    expect(isUniqueViolation(uniqueViolation())).toBe(true);
  });

  it("ignora qualquer outro erro", () => {
    expect(isUniqueViolation(new Error("timeout"))).toBe(false);
    expect(
      isUniqueViolation(Object.assign(new Error("x"), { code: "42P01" })),
    ).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});

describe("assignUsernameWithRetry", () => {
  it("grava o login na primeira tentativa quando não há corrida", async () => {
    const exists = async () => false;
    const persist = vi.fn(async (username: string) => username);

    expect(await assignUsernameWithRetry("Rodrigo", exists, persist)).toBe(
      "rodrigo",
    );
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("tenta o login seguinte quando outro cadastro leva o candidato", async () => {
    // Simula a corrida: na hora de escrever, "rodrigo" já foi levado por um
    // cadastro simultâneo — e só então passa a aparecer para `exists`.
    const taken = new Set<string>();
    const exists = async (username: string) => taken.has(username);
    const persist = vi.fn(async (username: string) => {
      if (username === "rodrigo") {
        taken.add("rodrigo");
        throw uniqueViolation();
      }
      return username;
    });

    expect(await assignUsernameWithRetry("Rodrigo", exists, persist)).toBe(
      "rodrigo2",
    );
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("desiste com null quando a corrida se repete além do limite", async () => {
    const exists = async () => false;
    const persist = vi.fn(async () => {
      throw uniqueViolation();
    });

    expect(
      await assignUsernameWithRetry("Rodrigo", exists, persist),
    ).toBeNull();
    expect(persist).toHaveBeenCalledTimes(5);
  });

  it("propaga erros que não são violação de unicidade", async () => {
    const exists = async () => false;
    const persist = vi.fn(async () => {
      throw new Error("conexão perdida");
    });

    await expect(
      assignUsernameWithRetry("Rodrigo", exists, persist),
    ).rejects.toThrow("conexão perdida");
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("devolve null sem repetir quando o usuário já tinha login", async () => {
    // `persist` devolve null quando o `where username IS NULL` não pega linha.
    const exists = async () => false;
    const persist = vi.fn(async () => null);

    expect(
      await assignUsernameWithRetry("Rodrigo", exists, persist),
    ).toBeNull();
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe("normalizeUsernameInput", () => {
  it("remove @ inicial, espaços e normaliza para minúsculas", () => {
    expect(normalizeUsernameInput("  @Rodrigo ")).toBe("rodrigo");
    expect(normalizeUsernameInput("RODRIGO")).toBe("rodrigo");
  });

  it("não remove @ no meio da string", () => {
    expect(normalizeUsernameInput("rodrigo@x")).toBe("rodrigo@x");
  });
});
