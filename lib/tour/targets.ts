/**
 * Os pontos da tela que o tour guiado pode destacar. União fechada — nenhum
 * componente espalha `data-tour="algo"` avulso: passa por aqui, então um
 * alvo com nome errado não compila (`lib/tour/steps.ts` referencia estes
 * mesmos valores).
 */
export const TOUR_TARGETS = [
  "saldo",
  "regiao",
  "proximos-jogos",
  "fechamento-mercado",
  "desempenho",
  "escalacao",
  "capitao",
  "orcamento",
  "relogio-mercado",
  "campeonatos",
  "perfil",
  "conta",
] as const;

export type TourTarget = (typeof TOUR_TARGETS)[number];

/** Espalhado no JSX: `<section {...tourTarget("orcamento")}>`. */
export function tourTarget(id: TourTarget): { "data-tour": TourTarget } {
  return { "data-tour": id };
}

/** O seletor CSS que `waitForTarget` (Fase 2) procura no DOM. */
export function tourSelector(id: TourTarget): string {
  return `[data-tour="${id}"]`;
}
