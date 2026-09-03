import { PLAYER_ROLES, type PlayerRole } from "@/lib/team/types";

/**
 * Agente de Valorant → função do fantasy. Puro e determinístico: dois
 * backfills sobre os mesmos dados produzem exatamente o mesmo catálogo.
 *
 * A lista de funções vem de `lib/team/types.ts` — a mesma que alimenta o
 * `pgEnum` de `player.role` e o agrupamento do mercado. Nenhuma cópia aqui.
 */
const AGENT_ROLES: Readonly<Record<string, PlayerRole>> = {
  // Duelistas
  jett: "Duelista",
  raze: "Duelista",
  reyna: "Duelista",
  phoenix: "Duelista",
  neon: "Duelista",
  yoru: "Duelista",
  iso: "Duelista",
  waylay: "Duelista",
  // Iniciadores
  sova: "Iniciador",
  breach: "Iniciador",
  skye: "Iniciador",
  kayo: "Iniciador",
  fade: "Iniciador",
  gekko: "Iniciador",
  tejo: "Iniciador",
  // Controladores
  omen: "Controlador",
  brimstone: "Controlador",
  viper: "Controlador",
  astra: "Controlador",
  harbor: "Controlador",
  clove: "Controlador",
  // Sentinelas
  sage: "Sentinela",
  cypher: "Sentinela",
  killjoy: "Sentinela",
  chamber: "Sentinela",
  deadlock: "Sentinela",
  vyse: "Sentinela",
};

/**
 * Chave de busca do mapa. O vlr escreve o mesmo agente de formas diferentes
 * conforme o lugar (`title="Kayo"` no scoreboard, "KAY/O" em texto), então a
 * comparação ignora caixa e qualquer coisa que não seja letra ou número.
 */
function agentKey(agent: string): string {
  return agent.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Função do agente, ou `null` se for um agente que ainda não conhecemos. */
export function agentToRole(agent: string): PlayerRole | null {
  return AGENT_ROLES[agentKey(agent)] ?? null;
}

/**
 * Função principal de um jogador a partir dos agentes que ele jogou: a do
 * agente mais frequente. Empate é resolvido pela ordem de `PLAYER_ROLES` —
 * não pela ordem em que os agentes apareceram no HTML — para que reprocessar
 * a mesma partida nunca mude a função de ninguém.
 *
 * `null` quando nenhum agente da lista é conhecido; quem chama decide o
 * default (o backfill marca `needsReview`).
 */
export function primaryRole(agents: readonly string[]): PlayerRole | null {
  const countByRole = new Map<PlayerRole, number>();

  for (const agent of agents) {
    const role = agentToRole(agent);
    if (!role) continue;
    countByRole.set(role, (countByRole.get(role) ?? 0) + 1);
  }
  if (countByRole.size === 0) return null;

  let best: PlayerRole | null = null;
  let bestCount = 0;
  // Itera na ordem canônica das funções: o desempate não depende da entrada.
  for (const role of PLAYER_ROLES) {
    const count = countByRole.get(role) ?? 0;
    if (count > bestCount) {
      best = role;
      bestCount = count;
    }
  }
  return best;
}
