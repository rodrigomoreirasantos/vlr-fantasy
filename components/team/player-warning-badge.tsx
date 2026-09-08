import { TriangleAlert } from "lucide-react";

import type { SlotWarning } from "@/lib/market/scope";
import { regionLabel } from "@/lib/round/regions";

export type PlayerWarningBadgeProps = {
  warning: SlotWarning;
};

/**
 * O selo de um jogador escalado que saiu do escopo do time — mudou de liga,
 * ou (no time Internacional) a organização dele deixou de estar
 * classificada (`.claude/plans/10-time-por-regiao.md`, decisão 7). Nunca
 * esvazia a vaga sozinho: é só um alerta, ao lado do chip da organização,
 * onde "onde ele joga" já vive (`PlayerIdentity`).
 */
export function PlayerWarningBadge({ warning }: PlayerWarningBadgeProps) {
  const label =
    warning.kind === "out-of-region"
      ? `Joga em ${regionLabel(warning.region)}`
      : "Fora do internacional";
  const title =
    warning.kind === "out-of-region"
      ? `Este jogador passou a atuar em ${regionLabel(warning.region)} — ele continua na sua escalação, mas não pode ser contratado de novo por este time.`
      : "A organização deste jogador não está mais classificada para o torneio internacional — ele continua na sua escalação.";

  return (
    <span
      title={title}
      className="flex min-w-0 items-center gap-1 text-[10px] font-semibold text-destructive uppercase"
    >
      <TriangleAlert aria-hidden className="size-3 flex-none" />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
