"use client";

import { useMemo, useState } from "react";

import { MatchRow } from "@/components/home/match-row";
import { Panel } from "@/components/layout/panel";
import type { UpcomingMatches as UpcomingMatchesData } from "@/lib/home/types";
import { eventFilterOptions } from "@/lib/round/events";
import { formatKickoffTime, toIsoDate } from "@/lib/round/format";
import { groupMatchesByDay, nextMatchId } from "@/lib/round/schedule";
import { cn } from "@/lib/utils";

export type UpcomingMatchesProps = {
  upcoming: UpcomingMatchesData;
  /** Injetável para o teste — o "agora" que define "Hoje" e a próxima partida. */
  now?: Date;
};

/** Quantos jogos o painel mostra antes de pedir licença para continuar. */
const VISIBLE_LIMIT = 12;

/**
 * O calendário real do circuito, alimentado pelo pipeline do vlr.gg.
 *
 * Agrupa por dia e lidera pelo horário — um calendário se lê por quando, não
 * por quem. Acima dele, um filtro por campeonato: o circuito tem grade demais
 * para uma lista só, e Champions e Masters vêm primeiro porque são os
 * torneios que decidem a temporada (a ordem é de `lib/round/events.ts`).
 */
export function UpcomingMatches({
  upcoming,
  now = new Date(),
}: UpcomingMatchesProps) {
  const { matches, myOrganizations } = upcoming;
  /** `null` = "Todos". O filtro guarda o campeonato, não o índice do chip. */
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const options = useMemo(() => eventFilterOptions(matches), [matches]);

  if (matches.length === 0) {
    return (
      <Panel title="Próximos jogos">
        <p className="text-sm text-muted-foreground">
          Nenhum jogo confirmado no circuito agora.
        </p>
      </Panel>
    );
  }

  const filtered = selectedEvent
    ? matches.filter((match) => match.event === selectedEvent)
    : matches;
  const visible = expanded ? filtered : filtered.slice(0, VISIBLE_LIMIT);
  const hidden = filtered.length - visible.length;

  const mine = new Set(myOrganizations);
  const days = groupMatchesByDay(visible, now);
  // Uma só ênfase na lista inteira: a partida que começa primeiro é a que
  // fecha o mercado, e é a única que muda o que o usuário faz agora. Vem da
  // lista **inteira**, não da filtrada — o mercado não fecha por campeonato.
  const nextId = nextMatchId(matches, now);

  /** Trocar de campeonato recomeça a lista do topo, não no meio da anterior. */
  function selectEvent(event: string | null) {
    setSelectedEvent(event);
    setExpanded(false);
  }

  return (
    <Panel title="Próximos jogos">
      {/* Só há o que filtrar com mais de um campeonato na grade. */}
      {options.length > 1 && (
        <div
          role="group"
          aria-label="Filtrar por campeonato"
          className="mb-4 flex flex-wrap gap-1.5"
        >
          <FilterChip
            label="Todos"
            count={matches.length}
            active={selectedEvent === null}
            onSelect={() => selectEvent(null)}
          />
          {options.map((option) => (
            <FilterChip
              key={option.event}
              label={option.label}
              title={option.event}
              count={option.count}
              active={selectedEvent === option.event}
              onSelect={() => selectEvent(option.event)}
            />
          ))}
        </div>
      )}

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

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-4 w-full text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:text-primary"
        >
          Ver mais {hidden} {hidden === 1 ? "jogo" : "jogos"}
        </button>
      )}
    </Panel>
  );
}

type FilterChipProps = {
  label: string;
  /** O nome longo do campeonato, quando `label` é a versão curta. */
  title?: string;
  count: number;
  active: boolean;
  onSelect: () => void;
};

/**
 * Um chip do filtro. `aria-pressed` em vez de uma `<ul>` de links: o estado
 * "este filtro está ligado" é o que o leitor de tela precisa ouvir, e é o que
 * o botão comunica sem inventar navegação que não existe.
 */
function FilterChip({
  label,
  title,
  count,
  active,
  onSelect,
}: FilterChipProps) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "clip-corner flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold tracking-[0.12em] uppercase ring-1 transition-colors [--clip:6px]",
        active
          ? "bg-primary text-primary-foreground ring-primary"
          : "bg-secondary text-muted-foreground ring-border hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn("tabular-nums", active ? "opacity-70" : "opacity-60")}
      >
        {count}
      </span>
    </button>
  );
}
