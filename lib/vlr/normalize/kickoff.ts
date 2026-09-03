import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * O fuso em que o vlr.gg renderiza `data-utc-ts`. **O nome do atributo mente:**
 * a partida 724899 traz `data-utc-ts="2026-09-02 17:00:00"` e imprime
 * "5:00 PM EDT" logo ao lado — os dois são o mesmo horário em
 * America/New_York, não em UTC. Ler o atributo como UTC desloca toda partida
 * em 4–5h e, com isso, o `marketClosesAt` da rodada: a regra inviolável de
 * travar a escalação no primeiro jogo passaria a travar horas depois.
 *
 * Fica aqui, e não em `lib/vlr/config.ts`, de propósito: este módulo é puro e
 * não pode depender da validação de env obrigatória do cliente HTTP.
 */
export const VLR_SOURCE_TZ = process.env.VLR_SOURCE_TZ ?? "America/New_York";

/**
 * `data-utc-ts` → instante real (UTC). Uma função, um teste — é onde o bug de
 * 4 horas morre.
 */
export function parseVlrTimestamp(
  ts: string,
  tz: string = VLR_SOURCE_TZ,
): Date {
  const parsed = dayjs.tz(ts, tz);
  if (!parsed.isValid()) {
    throw new Error(`Timestamp do vlr.gg inválido: ${JSON.stringify(ts)}`);
  }
  return parsed.utc().toDate();
}

/**
 * Meses por extenso, como o vlr.gg os escreve. Um mapa em vez de
 * `customParseFormat`: a aplicação chama `dayjs.locale("pt-br")` globalmente
 * (`lib/market/window.ts`), e qualquer job que importe aquele módulo faria
 * "September" deixar de ser reconhecido — em silêncio, devolvendo `null`.
 */
const MONTHS: Readonly<Record<string, number>> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `"5:00 PM"` → `[17, 0]`; `null` quando o vlr ainda não definiu ("TBD"). */
function parseClock(time: string): [number, number] | null {
  const match = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;

  let hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();

  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return [hour, minute];
}

/**
 * Horário aproximado de um card da lista `/matches`: o cabeçalho de dia (que
 * vive **fora** do card, ex. "Thu, September 3, 2026") mais
 * `.match-item-time` ("5:00 PM"), ambos em horário de Nova York. `null`
 * quando o vlr ainda não definiu o horário ("TBD").
 *
 * É deliberadamente aproximado — o horário confiável vem do detalhe, pelo
 * `data-utc-ts`. A lista serve para descobrir **quais** partidas existem.
 */
export function parseVlrDayTime(
  day: string,
  time: string,
  tz: string = VLR_SOURCE_TZ,
): Date | null {
  const dayMatch = day.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!dayMatch) return null;

  const month = MONTHS[dayMatch[1].toLowerCase()];
  if (!month) return null;

  const clock = parseClock(time);
  if (!clock) return null;

  const [hour, minute] = clock;
  const iso = `${dayMatch[3]}-${pad(month)}-${pad(Number.parseInt(dayMatch[2], 10))} ${pad(hour)}:${pad(minute)}:00`;
  return parseVlrTimestamp(iso, tz);
}
