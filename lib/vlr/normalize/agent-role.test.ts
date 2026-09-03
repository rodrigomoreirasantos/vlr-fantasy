// @vitest-environment node
import { describe, expect, it } from "vitest";

import { agentToRole, primaryRole } from "@/lib/vlr/normalize/agent-role";

describe("agentToRole", () => {
  it("mapeia um agente de cada função", () => {
    expect(agentToRole("Jett")).toBe("Duelista");
    expect(agentToRole("Sova")).toBe("Iniciador");
    expect(agentToRole("Omen")).toBe("Controlador");
    expect(agentToRole("Cypher")).toBe("Sentinela");
  });

  it("ignora caixa e pontuação — 'KAY/O', 'Kayo' e 'kay-o' são o mesmo agente", () => {
    expect(agentToRole("KAY/O")).toBe("Iniciador");
    expect(agentToRole("Kayo")).toBe("Iniciador");
    expect(agentToRole("kay-o")).toBe("Iniciador");
  });

  it("devolve null para um agente desconhecido, nunca um chute", () => {
    expect(agentToRole("Agente Novo")).toBeNull();
    expect(agentToRole("")).toBeNull();
  });
});

describe("primaryRole", () => {
  it("é a função do agente mais jogado", () => {
    expect(primaryRole(["Jett", "Raze", "Omen"])).toBe("Duelista");
  });

  it("ignora agentes desconhecidos ao contar", () => {
    expect(primaryRole(["Agente Novo", "Sage"])).toBe("Sentinela");
  });

  it("empate é determinístico: não depende da ordem de entrada", () => {
    // Duelista vem antes de Sentinela em PLAYER_ROLES — as duas ordens dão o mesmo.
    expect(primaryRole(["Jett", "Sage"])).toBe("Duelista");
    expect(primaryRole(["Sage", "Jett"])).toBe("Duelista");
  });

  it("devolve null quando nenhum agente é conhecido", () => {
    expect(primaryRole([])).toBeNull();
    expect(primaryRole(["Agente Novo"])).toBeNull();
  });
});
