/**
 * Rate limit global do processo: nunca duas requisições ao vlr.gg com menos
 * de `intervalMs` entre os **inícios**. Regra nº 2 do prompt, e a única forma
 * honesta de raspar um site que não tem API pública.
 *
 * Fila serial em singleton de módulo — não um `setInterval`, não um token
 * bucket: com uma cadeia de promessas, dez chamadas simultâneas viram dez
 * requisições espaçadas, na ordem em que pediram, sem contador para
 * dessincronizar.
 */
let chain: Promise<void> = Promise.resolve();
let lastStartedAt = 0;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve quando é permitido disparar a próxima requisição. Cada chamada
 * reserva sua vaga na fila no momento em que é feita.
 */
export function acquire(intervalMs: number): Promise<void> {
  const slot = chain.then(async () => {
    const waitMs = lastStartedAt + intervalMs - Date.now();
    if (waitMs > 0) await delay(waitMs);
    lastStartedAt = Date.now();
  });

  // A cadeia engole rejeições: um erro numa vaga não pode travar a fila
  // inteira para sempre. Quem chamou continua recebendo a rejeição em `slot`.
  chain = slot.catch(() => {});
  return slot;
}

/** Só para testes: esquece a última requisição e a fila pendente. */
export function resetRateLimiter(): void {
  chain = Promise.resolve();
  lastStartedAt = 0;
}
