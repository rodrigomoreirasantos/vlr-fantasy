import { z } from "zod";

/**
 * Configuração do pipeline do vlr.gg, validada uma vez e congelada.
 *
 * Schema interno (env), então as mensagens ficam em inglês — o CLAUDE.md
 * isenta explicitamente env/webhooks/UUIDs da regra de pt-BR: quem lê é quem
 * opera o deploy, não o jogador.
 *
 * A validação é **preguiçosa** de propósito. Se rodasse no import, qualquer
 * teste que tocasse a cadeia de módulos do scraper exigiria
 * `VLR_CONTACT_EMAIL` no ambiente — e nenhum teste faz rede.
 */
const configSchema = z.object({
  VLR_BASE_URL: z.url().default("https://www.vlr.gg"),
  // Obrigatória: é a única forma de o vlr.gg falar com a gente antes de
  // simplesmente bloquear o IP. Não existe default.
  VLR_CONTACT_EMAIL: z.email(),
  VLR_USER_AGENT: z.string().min(1).optional(),
  VLR_RATE_LIMIT_MS: z.coerce.number().int().positive().default(1100),
  VLR_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  VLR_STORAGE_DIR: z.string().min(1).default("storage/raw"),
});

export type VlrConfig = {
  baseUrl: string;
  contactEmail: string;
  /** Nunca se passa por navegador (regra nº 3): o UA se identifica e dá contato. */
  userAgent: string;
  rateLimitMs: number;
  requestTimeoutMs: number;
  storageDir: string;
};

let cached: VlrConfig | null = null;

export function getVlrConfig(): VlrConfig {
  if (cached) return cached;

  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid vlr.gg configuration: ${z.prettifyError(parsed.error)}`,
    );
  }
  const env = parsed.data;

  cached = Object.freeze({
    baseUrl: env.VLR_BASE_URL.replace(/\/+$/, ""),
    contactEmail: env.VLR_CONTACT_EMAIL,
    userAgent:
      env.VLR_USER_AGENT ?? `VlrFantasy/1.0 (+${env.VLR_CONTACT_EMAIL})`,
    rateLimitMs: env.VLR_RATE_LIMIT_MS,
    requestTimeoutMs: env.VLR_REQUEST_TIMEOUT_MS,
    storageDir: env.VLR_STORAGE_DIR,
  });
  return cached;
}

/** Só para testes: descarta o cache para reler `process.env`. */
export function resetVlrConfig(): void {
  cached = null;
}
