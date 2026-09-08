/**
 * O nome curto de um campeonato, para caber na linha de uma partida.
 *
 * `"VCT 2026: Americas Stage 2"` → `"Americas Stage 2"`,
 * `"Valorant Champions 2026"` → `"Champions"`. O que sobra do nome longo é
 * ano e circuito — informação que se repete em todas as linhas e portanto não
 * distingue nenhuma delas. O nome inteiro continua no `title` (`EventOrigin`).
 */
export function shortEventLabel(event: string): string {
  const afterCircuit = event.includes(":")
    ? event.slice(event.indexOf(":") + 1)
    : event;

  const trimmed = afterCircuit
    .trim()
    .replace(/^valorant\s+/i, "")
    .replace(/\s*\b(19|20)\d{2}\b\s*/g, " ")
    .trim();

  // Um nome que era só ano e circuito não vira string vazia: melhor o nome
  // longo do que um chip sem rótulo.
  return trimmed || event;
}
