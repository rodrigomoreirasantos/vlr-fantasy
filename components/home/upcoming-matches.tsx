import { MatchRow } from "@/components/home/match-row";
import { Panel } from "@/components/layout/panel";
import type { UpcomingMatches as UpcomingMatchesData } from "@/lib/home/types";
import { formatKickoffTime, toIsoDate } from "@/lib/round/format";
import { groupMatchesByDay, nextMatchId } from "@/lib/round/schedule";
import { cn } from "@/lib/utils";

export type UpcomingMatchesProps = {
  upcoming: UpcomingMatchesData;
  /** Injetável para o teste — o "agora" que define "Hoje" e a próxima partida. */
  now?: Date;
};

/**
 * O calendário real do circuito, alimentado pelo pipeline do vlr.gg.
 *
 * Difere de `<MatchList>` no recorte, não no visual: aquele mostra as partidas
 * **da sua rodada**, este mostra o que vai acontecer no circuito, esteja a sua
 * rodada onde estiver. Por isso agrupa por dia e lidera pelo horário — um
 * calendário se lê por quando, não por quem.
 */
export function UpcomingMatches({
  upcoming,
  now = new Date(),
}: UpcomingMatchesProps) {
  const { matches, myOrganizations } = upcoming;

  if (matches.length === 0) {
    return (
      <Panel title="Próximos jogos">
        <p className="text-sm text-muted-foreground">
          Nenhum jogo confirmado no circuito agora.
        </p>
      </Panel>
    );
  }

  const mine = new Set(myOrganizations);
  const days = groupMatchesByDay(matches, now);
  // Uma só ênfase na lista inteira: a partida que começa primeiro é a que
  // fecha o mercado, e é a única que muda o que o usuário faz agora.
  const nextId = nextMatchId(matches, now);

  return (
    <Panel title="Próximos jogos">
      <div className="flex flex-col gap-5">
        {days.map((day) => (
          <div key={day.key}>
            <div className="mb-2 flex items-baseline gap-3">
              <h3 className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                {day.label}
              </h3>
              <span aria-hidden className="h-px flex-1 bg-border" />
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {day.matches.length}
                {day.matches.length === 1 ? " jogo" : " jogos"}
              </span>
            </div>

            <ul className="flex flex-col gap-2">
              {day.matches.map((match) => {
                const isNext = match.id === nextId;

                return (
                  <MatchRow
                    key={match.id}
                    match={match}
                    mine={mine.has(match.teamA) || mine.has(match.teamB)}
                    next={isNext}
                    leading={
                      // O horário é a coluna pela qual se varre um calendário:
                      // largura fixa e `tabular-nums` mantêm os dígitos
                      // alinhados de linha em linha.
                      <time
                        dateTime={toIsoDate(match.scheduledAt)}
                        className={cn(
                          "w-11 shrink-0 text-sm font-bold tabular-nums",
                          isNext ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {formatKickoffTime(match.scheduledAt)}
                      </time>
                    }
                    trailing={
                      <span className="text-xs text-muted-foreground">
                        {match.event}
                      </span>
                    }
                  />
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}
