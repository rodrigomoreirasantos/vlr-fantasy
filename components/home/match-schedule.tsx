"use client";

import { useMemo, useState } from "react";

import { MatchRow } from "@/components/home/match-row";
import { eventFilterOptions } from "@/lib/round/events";
import { formatKickoffTime, toIsoDate } from "@/lib/round/format";
import {
  groupMatchesByDay,
  nextMatchId,
  type MatchTime,
} from "@/lib/round/schedule";
import type { RoundMatch } from "@/lib/round/types";
import { cn } from "@/lib/utils";

/** Quantos jogos a lista mostra antes de pedir licença para continuar. */
const VISIBLE_LIMIT = 12;

export type MatchScheduleProps = {
  matches: readonly RoundMatch[];
  /** Organizações dos seus 5 — destacam a partida deles na lista. */
  myOrganizations: readonly string[];
  /** `null` = "Todos". Controlado pelo painel, que também usa a escolha no topo. */
  selectedEvent: string | null;
  onSelectEvent: (event: string | null) => void;
  /**
   * O instante que cada linha mostra e por onde a lista agrupa: o kickoff no
   * calendário do circuito, o fechamento do mercado no painel da rodada.
   */
  timeOf?: MatchTime;
  /** Injetável para o teste — o "agora" que define "Hoje" e o próximo. */
  now?: Date;
};

/**
 * A grade de partidas: filtro por campeonato, agrupamento por dia, uma linha
 * por jogo.
 *
 * As duas listas da Home são esta mesma: "Próximos jogos" lê o kickoff,
 * "Sua rodada" lê o fechamento do mercado. Só o relógio muda (`timeOf`) —
 * duplicar a lista faria as duas divergirem na primeira mudança de estilo, e
 * a Home passaria a ter dois calendários com regras diferentes de agrupamento.
 */
export function MatchSchedule({
  matches,
  myOrganizations,
  selectedEvent,
  onSelectEvent,
  timeOf,
  now = new Date(),
}: MatchScheduleProps) {
  const options = useMemo(() => eventFilterOptions(matches), [matches]);

  const filtered = selectedEvent
    ? matches.filter((match) => match.event === selectedEvent)
    : matches;

  return (
    <div>
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
            onSelect={() => onSelectEvent(null)}
          />
          {options.map((option) => (
            <FilterChip
              key={option.event}
              label={option.label}
              title={option.event}
              count={option.count}
              active={selectedEvent === option.event}
              onSelect={() => onSelectEvent(option.event)}
            />
          ))}
        </div>
      )}

      {/* A `key` zera o "ver mais" a cada troca de filtro: a lista recomeça do
          topo, não no meio da anterior. */}
      <ScheduleDays
        key={selectedEvent ?? "all"}
        matches={filtered}
        allMatches={matches}
        myOrganizations={myOrganizations}
        timeOf={timeOf}
        now={now}
      />
    </div>
  );
}

type ScheduleDaysProps = {
  matches: readonly RoundMatch[];
  /** A grade inteira: o destaque de "próximo" não muda por causa do filtro. */
  allMatches: readonly RoundMatch[];
  myOrganizations: readonly string[];
  timeOf?: MatchTime;
  now: Date;
};

function ScheduleDays({
  matches,
  allMatches,
  myOrganizations,
  timeOf,
  now,
}: ScheduleDaysProps) {
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? matches : matches.slice(0, VISIBLE_LIMIT);
  const hidden = matches.length - visible.length;

  const mine = new Set(myOrganizations);
  const days = groupMatchesByDay(visible, now, timeOf);
  // Uma só ênfase na lista inteira, e vinda da grade completa: o próximo jogo
  // a começar é o mesmo esteja o filtro onde estiver.
  const nextId = nextMatchId(allMatches, now, timeOf);
  const at = timeOf ?? ((match: RoundMatch) => match.scheduledAt);

  return (
    <>
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
                      // O horário é a coluna pela qual se varre uma grade:
                      // largura fixa e `tabular-nums` mantêm os dígitos
                      // alinhados de linha em linha.
                      <time
                        dateTime={toIsoDate(at(match))}
                        className={cn(
                          "w-11 shrink-0 text-sm font-bold tabular-nums",
                          isNext ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {formatKickoffTime(at(match))}
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
    </>
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
