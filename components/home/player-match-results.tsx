import { PlayerPhoto } from "@/components/player/player-photo";
import { Badge } from "@/components/ui/badge";
import {
  groupPerformancesByMatch,
  summarizeRosterRound,
} from "@/lib/player/form";
import type {
  PlayerMatchPerformance,
  RosterMatchPlayer,
  RosterMatchRecap,
} from "@/lib/player/types";
import { EventOrigin } from "@/components/home/event-origin";
import { formatMatchKickoff, toIsoDate } from "@/lib/round/format";
import { cn } from "@/lib/utils";

/** Quantas partidas a lista mostra. Além disso vira histórico, não "o que aconteceu". */
export const VISIBLE_MATCHES = 6;

export type PlayerMatchResultsProps = {
  performances: readonly PlayerMatchPerformance[];
  /** Tamanho da escalação — o denominador de "3 dos seus 5 jogaram". */
  rosterSize: number;
  /** `null` = todos. O mesmo filtro que controla o gráfico. */
  selectedPlayerId: string | null;
};

/**
 * Como terminaram os jogos dos seus.
 *
 * A unidade é a **partida**, não o jogador: quando dois dos seus 5 se
 * enfrentam, o placar aparece uma vez só, com os dois nomes embaixo. Repetir o
 * mesmo 2 × 1 em dois cartões faria o usuário conferir se eram jogos
 * diferentes.
 */
export function PlayerMatchResults({
  performances,
  rosterSize,
  selectedPlayerId,
}: PlayerMatchResultsProps) {
  const filtered = selectedPlayerId
    ? performances.filter((row) => row.playerId === selectedPlayerId)
    : performances;

  // O resumo fala das **mesmas** partidas que a lista mostra. Somar o
  // histórico inteiro (até 200 séries) sob um título de rodada produzia frases
  // do tipo "8 vitórias e 5 derrotas, 214.0 pontos" ao lado de seis cartões
  // que não somavam aquilo — e do total da rodada, logo acima, que somava
  // outra coisa ainda.
  const recaps = groupPerformancesByMatch(filtered).slice(0, VISIBLE_MATCHES);
  const summary = summarizeRosterRound(recaps, rosterSize);

  if (recaps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {selectedPlayerId
          ? "Este jogador ainda não tem partida pontuada."
          : "Nenhuma partida dos seus jogadores foi pontuada ainda."}
      </p>
    );
  }

  return (
    <div>
      {summary && <p className="mb-3.5 text-sm">{summary}</p>}

      <ul className="flex flex-col gap-2">
        {recaps.map((recap) => (
          <MatchResult key={recap.matchId} recap={recap} />
        ))}
      </ul>
    </div>
  );
}

function MatchResult({ recap }: { recap: RosterMatchRecap }) {
  const { teamA, teamB, scoreA, scoreB, event, scheduledAt, status } = recap;
  const decided = scoreA !== null && scoreB !== null;

  return (
    <li className="clip-corner bg-secondary px-3 py-2.5 ring-1 ring-border [--clip:8px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="flex min-w-0 flex-1 items-center gap-2 text-sm font-bold uppercase">
          <SideName name={teamA} winner={decided && scoreA! > scoreB!} />
          <span className="tabular-nums">
            {decided ? (
              <>
                {scoreA} <span className="text-muted-foreground">×</span>{" "}
                {scoreB}
              </>
            ) : (
              <span className="text-muted-foreground">×</span>
            )}
          </span>
          <SideName name={teamB} winner={decided && scoreB! > scoreA!} />
        </p>

        {status === "live" && (
          <Badge className="text-[10px] tracking-wider uppercase">
            Ao vivo
          </Badge>
        )}

        <EventOrigin event={event}>
          {/* O `<time>` envolve só a data: o conteúdo dele tem que ser a
              representação legível do `dateTime`, e o nome do campeonato não é. */}
          <time
            dateTime={toIsoDate(scheduledAt)}
            className="text-[10px] text-muted-foreground"
          >
            {formatMatchKickoff(scheduledAt)}
          </time>
        </EventOrigin>
      </div>

      <ul className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
        {recap.players.map((player) => (
          <PlayerLine key={player.playerId} player={player} />
        ))}
      </ul>
    </li>
  );
}

function SideName({ name, winner }: { name: string; winner: boolean }) {
  return (
    <span className={cn("truncate", winner ? "" : "text-muted-foreground")}>
      {name}
    </span>
  );
}

function PlayerLine({ player }: { player: RosterMatchPlayer }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
      <PlayerPhoto
        photoUrl={player.photoUrl}
        nickname={player.nickname}
        size={20}
        shape="circle"
      />
      <span className="font-bold">{player.nickname}</span>
      <span className="text-muted-foreground">{player.team}</span>

      <span className="ml-auto flex items-baseline gap-3 tabular-nums">
        {/* Sem scoreboard extraído não se inventa "0/0/0": o traço diz que o
            número não existe, o zero diria que ele é zero. */}
        <span className="text-muted-foreground">
          {player.kills ?? "—"}/{player.deaths ?? "—"}/{player.assists ?? "—"}
        </span>
        {player.acs !== null && (
          <span className="text-muted-foreground">
            ACS {Math.round(player.acs)}
          </span>
        )}
        {/* Quantos mapas ele jogou e ganhou: numa Bo3 perdida por 2-1, saber
            que ele venceu o mapa dele explica a pontuação. */}
        <span className="text-muted-foreground">
          {player.mapsWon}/{player.mapsPlayed} mapas
        </span>
        <span
          className={cn(
            "font-bold",
            player.points >= 0 ? "text-info" : "text-destructive",
          )}
        >
          {player.points >= 0 ? "+" : "−"}
          {Math.abs(player.points).toFixed(1)}
        </span>
      </span>
    </li>
  );
}
