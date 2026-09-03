import { Badge } from "@/components/ui/badge";
import type { RoundMatch } from "@/lib/round/types";
import { cn } from "@/lib/utils";

export type MatchRowProps = {
  match: RoundMatch;
  /** A partida envolve um dos seus 5 jogadores. */
  mine: boolean;
  /** É a próxima a começar — a que fecha o mercado (regra inviolável nº 8). */
  next?: boolean;
  /** Coluna da esquerda, ex. o horário no calendário do circuito. */
  leading?: React.ReactNode;
  /** Coluna da direita: campeonato, horário — o que o contexto pedir. */
  trailing: React.ReactNode;
};

/**
 * Uma partida numa lista. Compartilhada pelo calendário da rodada
 * (`<MatchList>`) e pelo calendário do circuito (`<UpcomingMatches>`): as duas
 * telas mostram a mesma coisa com contextos diferentes nas laterais, e
 * duplicar a linha faria as duas divergirem na primeira mudança de estilo.
 */
export function MatchRow({
  match,
  mine,
  next = false,
  leading,
  trailing,
}: MatchRowProps) {
  const live = match.status === "live";

  return (
    <li
      className={cn(
        "clip-corner flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-secondary px-3 py-2.5 ring-1 [--clip:8px]",
        next ? "ring-primary" : mine ? "ring-primary/40" : "ring-border",
      )}
    >
      {leading}

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-bold uppercase">
          {match.teamA} <span className="text-muted-foreground">×</span>{" "}
          {match.teamB}
        </span>

        {live && (
          <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-primary uppercase">
            {/* `aria-hidden`: o ponto é redundante com o texto ao lado. */}
            <span
              aria-hidden
              className="size-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
            />
            Ao vivo
          </span>
        )}

        {next && (
          <Badge className="text-[10px] tracking-wider uppercase">
            Próximo
          </Badge>
        )}
        {mine && (
          <Badge variant="outline" className="text-[10px]">
            Seu jogador
          </Badge>
        )}
      </div>

      {trailing}
    </li>
  );
}
