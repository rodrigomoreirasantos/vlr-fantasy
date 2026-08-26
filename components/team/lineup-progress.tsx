export type LineupProgressProps = {
  filled: number;
  total: number;
};

/**
 * Faixa "X de N jogadores escalados", visível enquanto a escalação não está
 * completa. Some sozinha assim que `filled === total` — o chamador decide
 * se renderiza ou não; este componente só cuida do texto e do destaque.
 */
export function LineupProgress({ filled, total }: LineupProgressProps) {
  return (
    <div className="clip-corner mb-4 bg-primary/10 p-3 ring-1 ring-primary/40 [--clip:10px]">
      <p className="text-xs font-bold uppercase">
        Monte seu time · {filled} de {total} jogadores escalados
      </p>
      {filled === 0 && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Clique em uma vaga para contratar seu primeiro jogador.
        </p>
      )}
    </div>
  );
}
