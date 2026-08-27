import dayjs from "dayjs";
import "dayjs/locale/pt-br";

dayjs.locale("pt-br");

/** Data do convite por extenso, ex. "14/03 às 18:00". */
export function formatInvitedAt(invitedAt: Date): string {
  return dayjs(invitedAt).format("DD/MM [às] HH:mm");
}
