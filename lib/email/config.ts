import { z } from "zod";

/**
 * Configuração do módulo de e-mail transacional, validada uma vez e
 * congelada — mesmo molde de `lib/vlr/config.ts`.
 *
 * Schema interno (env), então as mensagens ficam em inglês — o CLAUDE.md
 * isenta explicitamente env/webhooks/UUIDs da regra de pt-BR: quem lê é quem
 * opera o deploy, não o jogador.
 *
 * A validação é **preguiçosa** de propósito: se rodasse no import, qualquer
 * teste que tocasse a cadeia de módulos de auth exigiria `RESEND_API_KEY` no
 * ambiente — e nenhum teste faz rede.
 */
const configSchema = z.object({
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default("VLR Fantasy <onboarding@resend.dev>"),
});

export type EmailConfig =
  | { transport: "console" }
  | { transport: "resend"; apiKey: string; from: string };

let cached: EmailConfig | null = null;

export function getEmailConfig(): EmailConfig {
  if (cached) return cached;

  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid email configuration: ${z.prettifyError(parsed.error)}`,
    );
  }
  const env = parsed.data;

  // Sem chave: o "envio" vira `console.log` (dev). Nunca lança por falta de
  // chave — só o transporte `resend` exige rede.
  cached = env.RESEND_API_KEY
    ? Object.freeze({
        transport: "resend" as const,
        apiKey: env.RESEND_API_KEY,
        from: env.EMAIL_FROM,
      })
    : Object.freeze({ transport: "console" as const });

  return cached;
}

/** Só para testes: descarta o cache para reler `process.env`. */
export function resetEmailConfig(): void {
  cached = null;
}
