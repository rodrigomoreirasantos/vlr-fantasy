import { formatScore, scoreTone, type ScoreTone } from "@/lib/team/score";
import { cn } from "@/lib/utils";

const toneClasses: Record<ScoreTone, string> = {
  positive: "bg-success/20 text-success",
  negative: "bg-primary/20 text-primary",
  neutral: "text-muted-foreground",
};

/**
 * O chip neutro precisa recuar contra o que estiver atrás dele, então sua cor
 * depende da superfície onde o chip é colocado.
 */
const neutralOnSurface = {
  card: "bg-secondary",
  secondary: "bg-card",
} as const;

const sizeClasses = {
  sm: "px-[9px] py-[3px] text-[13px]",
  md: "px-[11px] py-1.5 text-[15px]",
} as const;

export type PlayerScoreProps = {
  score: number;
  /** Superfície logo atrás do chip — define o tom do estado neutro. */
  surface?: keyof typeof neutralOnSurface;
  size?: keyof typeof sizeClasses;
  /**
   * Rótulo da unidade ao lado do número, ex. `"PTS"`. Sem ele o chip é só um
   * número solto, que na lista do "Resumo" — ao lado do botão de vender —
   * podia ser lido como preço ou como parte da ação. Omitido onde o espaço
   * não permite e o contexto já diz o que é (os marcadores do campo).
   */
  unit?: string;
  className?: string;
};

/**
 * Pontuação de um jogador, colorida pela faixa em que cai. Compartilhado entre
 * as telas "Meu Time" e "Mercado" — não duplique essa lógica de exibição.
 */
export function PlayerScore({
  score,
  surface = "secondary",
  size = "md",
  unit,
  className,
}: PlayerScoreProps) {
  const tone = scoreTone(score);

  return (
    <span
      className={cn(
        "inline-block font-extrabold tabular-nums",
        sizeClasses[size],
        toneClasses[tone],
        tone === "neutral" && neutralOnSurface[surface],
        className,
      )}
    >
      {formatScore(score)}
      {unit && (
        <>
          {" "}
          <span className="text-[0.7em] font-bold opacity-70">{unit}</span>
        </>
      )}
    </span>
  );
}
