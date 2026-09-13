/**
 * Espera um elemento aparecer no DOM — a página dinâmica (Supabase) pode
 * ainda estar renderizando quando o `TourProvider` chega no passo seguinte
 * (fato 1 do plano). Resolve na hora se o alvo já existe; senão observa o
 * `document.body` até ele nascer, o tempo estourar (`null`) ou o chamador
 * abortar (`null` também — trocar de passo cancela a espera anterior).
 */
export type WaitForTargetOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 8_000;

export function waitForTarget(
  selector: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS, signal }: WaitForTargetOptions = {},
): Promise<Element | null> {
  const existing = document.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  if (signal?.aborted) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: Element | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) finish(found);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => finish(null), timeoutMs);

    const onAbort = () => finish(null);
    signal?.addEventListener("abort", onAbort);
  });
}
