import type { Crest } from "@/lib/crest/types";

/**
 * As quatro funções de Valorant. Fonte única desta lista — `db/schema/players.ts`
 * importa daqui para o `pgEnum`, e a UI itera sobre ela ao agrupar o mercado
 * por função (vaga vazia: `components/market/market-sheet.tsx`).
 */
export const PLAYER_ROLES = [
  "Duelista",
  "Iniciador",
  "Controlador",
  "Sentinela",
] as const;

export type PlayerRole = (typeof PLAYER_ROLES)[number];

export type Player = {
  id: string;
  nickname: string;
  /** Organização do jogador na vida real, ex. "FNATIC". */
  team: string;
  agent: string;
  role: PlayerRole;
  /** Pontuação acumulada na rodada corrente. */
  score: number;
  /** Preço no catálogo, em centavos de crédito. */
  priceCents: number;
  /**
   * Disponível para escalar/contratar nesta rodada. Candidatos inativos não
   * aparecem no mercado, mas o campo viaja com o jogador para que
   * `evaluateSubstitution` (lib/market/eligibility.ts) tenha como bloquear a
   * troca mesmo se, por alguma corrida, um inativo chegar até ela.
   */
  active: boolean;
};

/**
 * Uma das cinco vagas da escalação. `player` é `null` enquanto o usuário não
 * escalou ninguém — o estado inicial de todo time novo. `id` é o identificador
 * da vaga no banco: a Server Action de substituição precisa dele para saber
 * qual `roster_slot` travar e atualizar. É `null` só no caso degenerado de um
 * time sem a linha dessa posição — a vaga aparece, mas não é selecionável.
 */
export type RosterSlot = {
  id: string | null;
  player: Player | null;
  captain: boolean;
};

export type TeamSummary = {
  name: string;
  crest: Crest;
  /** Pontuação total do time na rodada. */
  points: number;
  /** Saldo em moeda virtual disponível para o mercado, em centavos de crédito. */
  balanceCents: number;
  scoredMatches: { played: number; total: number };
  market: {
    open: boolean;
    /** Tempo restante já formatado, ex. "36h 12m" (lib/market/window.ts). */
    closesIn: string;
    /** Instante de fechamento, para um futuro countdown ao vivo no cliente. */
    closesAt: Date | null;
  };
};
