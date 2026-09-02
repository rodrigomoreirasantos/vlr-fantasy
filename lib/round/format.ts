import dayjs from "dayjs";
import "dayjs/locale/pt-br";

import type { PlayerAvailability } from "@/lib/team/types";

// Nenhum componente formata data na mão — sempre via dayjs, no mesmo padrão
// de `lib/market/window.ts` e `lib/championship/format.ts`.
dayjs.locale("pt-br");

/** Horário de uma partida, ex. "qua, 12/03 às 21:00". */
export function formatMatchKickoff(scheduledAt: Date): string {
  return dayjs(scheduledAt).format("ddd, DD/MM [às] HH:mm");
}

const AVAILABILITY_LABELS: Record<PlayerAvailability, string> = {
  available: "Disponível",
  bench: "Reserva",
  injured: "Lesionado",
  eliminated: "Time eliminado",
  doubtful: "Dúvida",
};

/** Rótulo curto pt-BR de cada estado de disponibilidade. */
export function availabilityLabel(availability: PlayerAvailability): string {
  return AVAILABILITY_LABELS[availability];
}

/**
 * Frase completa do alerta de indisponibilidade, ex. "TenZ não deve jogar
 * (Lesionado): fora por lesão no pulso.". Sem nota, cai só no rótulo.
 */
export function availabilityMessage(
  nickname: string,
  availability: PlayerAvailability,
  note: string | null,
): string {
  const base = `${nickname} não deve jogar (${availabilityLabel(availability)})`;
  return note ? `${base}: ${note}.` : `${base}.`;
}
