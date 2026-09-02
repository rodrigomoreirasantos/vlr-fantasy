import dayjs from "dayjs";
import "dayjs/locale/pt-br";

import type { InviteBlockReason } from "@/lib/championship/queries";

dayjs.locale("pt-br");

/** Data do convite por extenso, ex. "14/03 às 18:00". */
export function formatInvitedAt(invitedAt: Date): string {
  return dayjs(invitedAt).format("DD/MM [às] HH:mm");
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
