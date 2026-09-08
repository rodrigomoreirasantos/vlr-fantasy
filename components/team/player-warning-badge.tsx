import { TriangleAlert } from "lucide-react";

import type { SlotWarning } from "@/lib/market/scope";
import { regionLabel } from "@/lib/round/regions";

export type PlayerWarningBadgeProps = {
  warning: SlotWarning;
};

/**
 * O texto do selo: o rótulo curto que cabe na linha e a explicação longa que
 * vira o `title`. Um `switch` exaustivo (mesmo padrão de `blockReasonMessage`,
 * lib/market/eligibility.ts) — um motivo novo em `SlotWarning` quebra o build
 * aqui em vez de cair num texto genérico.
 */
function warningCopy(warning: SlotWarning): { label: string; title: string } {
  switch (warning.kind) {
    case "out-of-region":
      return {
        label: `Joga em ${regionLabel(warning.region)}`,
        title: `Este jogador passou a atuar em ${regionLabel(warning.region)} — ele continua na sua escalação, mas não pode ser contratado de novo por este time.`,
      };
    case "unknown-region":
      return {
        label: "Região indefinida",
        title:
          "Ainda não sabemos em que liga este jogador atua — ele continua na sua escalação, e o scrap resolve a região assim que ele entrar em quadra.",
      };
    case "not-qualified":
      return {
        label: "Fora do internacional",
        title:
          "A organização deste jogador não está mais classificada para o torneio internacional — ele continua na sua escalação.",
      };
  }
}

/**
 * O selo de um jogador escalado que saiu do escopo do time — mudou de liga,
 * ainda não tem liga resolvida, ou (no time Internacional) a organização
 * dele deixou de estar classificada (`.claude/plans/10-time-por-regiao.md`,
 * decisão 7). Nunca esvazia a vaga sozinho: é só um alerta.
 *
 * Fica numa linha própria dentro de `PlayerIdentity`, com o texto truncável:
 * disputando espaço com organização + função, ele empurrava o placar e o
 * botão "Vender" para fora da linha.
 */
export function PlayerWarningBadge({ warning }: PlayerWarningBadgeProps) {
  const { label, title } = warningCopy(warning);

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
