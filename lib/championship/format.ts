import dayjs from "dayjs";
import "dayjs/locale/pt-br";

import type { InviteBlockReason } from "@/lib/championship/queries";
import { DISPLAY_FALLBACK_TZ } from "@/lib/round/timezone";

dayjs.locale("pt-br");

/**
 * Data do convite por extenso, ex. "14/03 às 18:00", no fuso de quem lê.
 *
 * Importa `DISPLAY_FALLBACK_TZ` de `lib/round/timezone` — não só pelo valor
 * default, mas porque é esse import que garante `dayjs.extend(utc)`/
 * `dayjs.extend(timezone)` antes do `.tz()` abaixo (sem isso, `.tz` nem existe
 * no objeto dayjs e a chamada quebra em runtime).
 */
export function formatInvitedAt(
  invitedAt: Date,
  tz: string = DISPLAY_FALLBACK_TZ,
): string {
  return dayjs(invitedAt).tz(tz).format("DD/MM [às] HH:mm");
}

/** Mensagem pt-BR de cada motivo de bloqueio de `inviteUserToChampionship`. */
export function inviteBlockMessage(reason: InviteBlockReason): string {
  switch (reason) {
    case "not_owner":
      return "Só quem criou o campeonato pode convidar.";
    case "self":
      return "Você já está neste campeonato.";
    case "already_member":
      return "Esse jogador já está no campeonato.";
    case "already_invited":
      return "Esse jogador já foi convidado.";
  }
}
