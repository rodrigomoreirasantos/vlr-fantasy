import { createHash } from "node:crypto";

/**
 * Ordena as chaves de todo objeto (recursivamente) e converte `Date` para
 * ISO — o que faz `fingerprint` não depender da ordem em que um parser monta
 * o objeto, nem do fuso local do processo.
 */
function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = canonicalize(source[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * SHA-256 do JSON canônico de um payload **já interpretado** pelo parser —
 * nunca do HTML bruto. A página do vlr carrega carimbos relativos ("2d ago"),
 * cookie de sessão e blocos que mudam a cada leitura; o hash do HTML quase
 * nunca repetiria e a otimização (Decisões 2 e 5 do plano 17) seria inócua.
 * O hash da saída do parser muda só quando o conteúdo que nos interessa muda.
 */
export function fingerprint(value: unknown): string {
  const canonicalJson = JSON.stringify(canonicalize(value));
  return createHash("sha256").update(canonicalJson).digest("hex");
}
