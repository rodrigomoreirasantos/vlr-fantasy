import { getVlrConfig } from "@/lib/vlr/config";
import { errorMessage, logInfo, logWarn } from "@/lib/vlr/http/log";
import { acquire } from "@/lib/vlr/http/rate-limiter";

/** Falha de rede/HTTP ao falar com o vlr.gg — carrega o status para o job decidir. */
export class VlrHttpError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "VlrHttpError";
  }
}

/** Três tentativas: a primeira e mais duas, com backoff 1s → 2s. */
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1_000;

/** Status que merecem nova tentativa — o resto é problema nosso, não do servidor. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export type FetchHtmlResult = {
  html: string;
  url: string;
  status: number;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * **O único ponto de saída de rede da aplicação.** Nenhum outro módulo chama
 * `fetch`: scrapers recebem HTML, parsers recebem strings. É o que permite
 * testar todo o pipeline sem uma requisição sequer, e o que garante que o
 * rate limit não tem por onde escapar — `acquire` roda antes de **cada**
 * tentativa, retentativas inclusive.
 */
export async function fetchHtml(path: string): Promise<FetchHtmlResult> {
  const config = getVlrConfig();
  const url = path.startsWith("http")
    ? path
    : `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await acquire(config.rateLimitMs);
    const startedAt = Date.now();

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": config.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });
      const durationMs = Date.now() - startedAt;

      if (!response.ok) {
        // 4xx que não seja 429 é um erro nosso (URL errada, partida apagada):
        // repetir só gasta a paciência do servidor.
        if (!RETRYABLE_STATUS.has(response.status)) {
          throw new VlrHttpError(
            `vlr.gg respondeu ${response.status} para ${url}`,
            url,
            response.status,
          );
        }
        logWarn("vlr.http.retryable", {
          url,
          status: response.status,
          durationMs,
          attempt,
        });
        lastError = new VlrHttpError(
          `vlr.gg respondeu ${response.status} para ${url}`,
          url,
          response.status,
        );
      } else {
        const html = await response.text();
        logInfo("vlr.http.ok", {
          url,
          status: response.status,
          durationMs,
          attempt,
          bytes: html.length,
        });
        return { html, url, status: response.status };
      }
    } catch (error) {
      // Um 4xx definitivo sobe na hora; erro de rede/timeout é retentável.
      if (error instanceof VlrHttpError && error.status !== undefined) {
        if (!RETRYABLE_STATUS.has(error.status)) throw error;
      }
      lastError = error;
      logWarn("vlr.http.error", {
        url,
        attempt,
        durationMs: Date.now() - startedAt,
        error: errorMessage(error),
      });
    }

    if (attempt < MAX_ATTEMPTS) {
      await delay(BACKOFF_BASE_MS * 2 ** (attempt - 1));
    }
  }

  throw new VlrHttpError(
    `vlr.gg falhou após ${MAX_ATTEMPTS} tentativas: ${errorMessage(lastError)}`,
    url,
    lastError instanceof VlrHttpError ? lastError.status : undefined,
  );
}
