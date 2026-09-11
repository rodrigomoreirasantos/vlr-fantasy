import type { Crest } from "@/lib/crest/types";
import type { PlayerRegion, TeamRegion } from "@/lib/round/regions";
import type { MarketScope, SlotWarning } from "@/lib/market/scope";

/**
 * As quatro funções de Valorant. Fonte única desta lista — `db/schema/players.ts`
 * importa daqui para o `pgEnum`, e a UI itera sobre ela ao agrupar o mercado
 * por função (vaga vazia: `components/market/market-sheet.tsx`).
 */
/**
 * As cinco vagas fixas de toda escalação. Fonte única desta constante — o
 * denominador de "3 dos seus 5 jogaram" é o tamanho do elenco, não a
 * quantidade de vagas preenchidas.
 */
export const ROSTER_SIZE = 5;

export const PLAYER_ROLES = [
  "Duelista",
  "Iniciador",
  "Controlador",
  "Sentinela",
] as const;

export type PlayerRole = (typeof PLAYER_ROLES)[number];

/**
 * Estados possíveis de disponibilidade de um jogador na rodada corrente.
 * Lista fechada — são estados do jogo, não um catálogo que cresce — por
 * isso vira `pgEnum` em `db/schema/players.ts`, que importa daqui (mesmo
 * import unidirecional que `PLAYER_ROLES` já usa). Independente de `active`:
 * `active` é quem sai do catálogo do mercado, `availability` é quem joga.
 */
export const PLAYER_AVAILABILITIES = [
  "available",
  "bench",
  "injured",
  "eliminated",
  "doubtful",
] as const;

export type PlayerAvailability = (typeof PLAYER_AVAILABILITIES)[number];

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
  /** Disponibilidade para a próxima rodada — alimenta os alertas da Home. */
  availability: PlayerAvailability;
  /** Detalhe opcional em pt-BR, ex. "Fora por lesão no pulso". */
  availabilityNote: string | null;
  /**
   * A liga a que o jogador pertence hoje — o filtro do mercado regional
   * (`.claude/plans/10-time-por-regiao.md`). Nunca `"international"`.
   */
  region: PlayerRegion;
  /**
   * URL absoluta da foto do jogador, vinda do elenco raspado
   * (`vlrImageUrl`, `lib/vlr/scrapers/parse.ts`). `null` para quem nunca foi
   * visto num elenco do vlr, ou cujo retrato lá é a silhueta genérica —
   * cai no placeholder hachurado (`components/player/player-photo.tsx`).
   */
  photoUrl: string | null;
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
  /**
   * O jogador escalado não pertence mais ao escopo do time — mudou de liga,
   * ou (no time Internacional) a organização dele deixou de estar
   * classificada. `null` quando está em casa. Nunca esvazia a vaga sozinho
   * (decisão 7 do plano): é só um alerta, o usuário decide quando trocar.
   */
  warning: SlotWarning | null;
};

export type TeamSummary = {
  name: string;
  crest: Crest;
  /** Pontuação total do time na rodada. */
  points: number;
  /** Saldo em moeda virtual disponível para o mercado, em centavos de crédito. */
  balanceCents: number;
  /** A região deste time — Americas, EMEA, Pacific, China ou Internacional. */
  region: TeamRegion;
  market: {
    open: boolean;
    /** Tempo restante já formatado, ex. "36h 12m" (lib/market/window.ts). */
    closesIn: string;
    /** Instante de fechamento, alimenta o countdown ao vivo no cliente. */
    closesAt: Date | null;
  };
};

/**
 * O que a Server Action `loadMarket` (app/(app)/my-team/actions.ts) devolve
 * ao `MarketSheet`: o catálogo e tudo que decide a elegibilidade, relido do
 * banco no instante em que o usuário abre uma vaga.
 *
 * Mora **aqui**, e não junto da action, porque um módulo `"use server"` só
 * deve exportar Server Actions — é a regra do Next, e é o que todo
 * `actions.ts` deste projeto já faz. `loadMarket` anota este tipo como
 * retorno, então os dois não têm como divergir em silêncio.
 */
export type MarketData = {
  market: Record<PlayerRole, Player[]>;
  scope: MarketScope;
  balanceCents: number;
  marketOpen: boolean;
  /** Organizações cujo mercado fechou hoje (`lockedOrganizations`). */
  lockedTeams: string[];
  closesAt: Date | null;
  closesIn: string;
};
