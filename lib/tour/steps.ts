import { MARKET_CLOSE_LEAD_MS } from "@/lib/market/window";
import { MAX_PATRIMONY_CENTS } from "@/lib/market/budget";
import { formatCredits } from "@/lib/market/money";
import { CAPTAIN_MULTIPLIER } from "@/lib/scoring/team";
import type { TourTarget } from "@/lib/tour/targets";

export type TourRoute = "/home" | "/my-team" | "/ranking" | "/profile";

export type TourStep = {
  id: string;
  /** `null` = o passo abre onde o usuário estiver (só o convite). */
  route: TourRoute | null;
  /** `null` = cartão centralizado, sem recorte. */
  target: TourTarget | null;
  /** Tentado quando `target` não aparece — ex. Home sem jogos. */
  fallback?: TourTarget;
  title: string;
  body: string;
};

const marketCloseLeadHours = MARKET_CLOSE_LEAD_MS / 3_600_000;

/**
 * Os 13 passos do tour, na ordem em que aparecem.
 *
 * Regra de redação (travada em teste, `steps.test.ts`): título ≤ 28
 * caracteres, texto ≤ 120 — pouquíssimo texto por passo, uma ideia só. Os
 * números de regra citados vêm de constantes de domínio, nunca de literal
 * solto: se a regra mudar, o tour muda junto, sem ninguém precisar lembrar
 * de atualizar esta lista.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "boas-vindas",
    route: null,
    target: null,
    title: "Bem-vindo ao VLR Fantasy",
    body: "Monte um time com 5 pros de Valorant e pontue com as partidas reais deles. Leva 1 minuto.",
  },
  {
    id: "saldo",
    route: "/home",
    target: "saldo",
    title: "Seu saldo",
    body: "Créditos para contratar. Jogador que joga bem valoriza e rende mais na venda.",
  },
  {
    id: "regiao",
    route: "/home",
    target: "regiao",
    title: "Um time por região",
    body: "Você tem um time em cada liga. Troque aqui qual está vendo.",
  },
  {
    id: "proximos-jogos",
    route: "/home",
    target: "proximos-jogos",
    title: "Próximos jogos",
    body: "A agenda do circuito, já no seu fuso horário.",
  },
  {
    id: "fechamento-mercado",
    route: "/home",
    target: "fechamento-mercado",
    fallback: "proximos-jogos",
    title: "Fique de olho no fechamento",
    body: `O mercado de cada campeonato fecha ${marketCloseLeadHours}h antes do 1º jogo do dia. Depois, só no dia seguinte.`,
  },
  {
    id: "desempenho",
    route: "/home",
    target: "desempenho",
    title: "Seus pontos",
    body: "Kills, assistências, first bloods e vitórias viram pontos. Veja aqui quem rendeu.",
  },
  {
    id: "escalacao",
    route: "/my-team",
    target: "escalacao",
    title: "Sua escalação",
    body: "Toque numa vaga para abrir o mercado: contrate, troque ou venda.",
  },
  {
    id: "capitao",
    route: "/my-team",
    target: "capitao",
    title: "Capitão",
    body: `Toque no C de um jogador: o capitão pontua ${CAPTAIN_MULTIPLIER}×.`,
  },
  {
    id: "orcamento",
    route: "/my-team",
    target: "orcamento",
    title: "Teto do patrimônio",
    body: `Saldo + elenco não passam de ${formatCredits(MAX_PATRIMONY_CENTS)} cr. Os mais caros nunca cabem todos juntos.`,
  },
  {
    id: "relogio-mercado",
    route: "/my-team",
    target: "relogio-mercado",
    title: "Quanto falta",
    body: "Aqui você vê se o mercado está aberto e quando fecha. Não deixe para a última hora.",
  },
  {
    id: "campeonatos",
    route: "/ranking",
    target: "campeonatos",
    title: "Campeonatos",
    body: "Crie uma liga, convide amigos e dispute a pontuação da rodada.",
  },
  {
    id: "perfil",
    route: "/profile",
    target: "perfil",
    title: "Seu perfil",
    body: "Troque nome e brasão e adicione amigos pelo @ para chamar aos seus campeonatos.",
  },
  {
    id: "conta",
    route: "/profile",
    target: "conta",
    title: "Quer rever?",
    body: "O tutorial fica aqui no seu menu, junto de Sair. Boa rodada!",
  },
];
