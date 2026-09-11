"use client";

import { useMemo, useState } from "react";

import { FilterChip } from "@/components/home/filter-chip";
import { EventOrigin } from "@/components/home/event-origin";
import { MatchRow } from "@/components/home/match-row";
import { formatKickoffTime, toIsoDate } from "@/lib/round/format";
import type { EventRegion } from "@/lib/round/regions";
import {
  matchesInRegion,
  regionColor,
  regionFilterOptions,
  regionLabel,
} from "@/lib/round/regions";
import { groupMatchesByDay, nextMatchId } from "@/lib/round/schedule";
import type { RoundMatch } from "@/lib/round/types";
import { cn } from "@/lib/utils";

/** Quantos jogos a lista mostra de saída. */
const VISIBLE_LIMIT = 12;
/** Quantos ela acrescenta a cada "ver mais" — o calendário inteiro pode ter centenas. */
const LOAD_MORE_STEP = 24;

export type MatchScheduleProps = {
  matches: readonly RoundMatch[];
  /** Organizações dos seus 5 — destacam a partida deles na lista. */
  myOrganizations: readonly string[];
  /** `null` = "Todos". Controlado pelo painel, que também usa a escolha no topo. */
  selectedRegion: EventRegion | null;
  onSelectRegion: (region: EventRegion | null) => void;
  /**
   * Quando o mercado de cada partida fecha (`marketClosesByMatch`). A linha
   * mostra o kickoff **e** esse horário: são as duas horas que o usuário
   * precisa cruzar, e obrigá-lo a fazer a subtração de cabeça seria pedir que
   * ele guardasse a regra em vez de ler a tela.
   */
  closesBy: Map<string, Date>;
  /** Injetável para o teste — o "agora" que define "Hoje" e o próximo. */
  now?: Date;
};

/**
 * A grade de partidas: filtro por região, agrupamento por dia, uma linha por
 * jogo — com o kickoff à esquerda e o fechamento do mercado à direita.
 *
 * O filtro era por campeonato e virou por região: é assim que quem joga lê o
 * circuito ("os jogos da minha liga"), e uma liga pode ter mais de um
 * campeonato acontecendo — VCT e Challengers da mesma região caíam em dois
 * chips que o usuário tinha de alternar. O nome do campeonato não some, muda
 * de lugar: passa a ser a linha de cada partida (§`MatchOrigin`).
 */
export function MatchSchedule({
  matches,
  myOrganizations,
  selectedRegion,
  onSelectRegion,
  closesBy,
  now = new Date(),
}: MatchScheduleProps) {
  const options = useMemo(() => regionFilterOptions(matches), [matches]);

  const filtered = matchesInRegion(matches, selectedRegion);

  return (
    <div>
      {/* Só há o que filtrar com mais de uma região na grade. */}
      {options.length > 1 && (
        <div
          role="group"
          aria-label="Filtrar por região"
          className="mb-4 flex flex-wrap gap-1.5"
        >
          <FilterChip
            label="Todos"
            count={matches.length}
            active={selectedRegion === null}
            onSelect={() => onSelectRegion(null)}
          />
          {options.map((option) => (
            <FilterChip
              key={option.region}
              label={option.label}
              count={option.count}
              accent={regionColor(option.region)}
              active={selectedRegion === option.region}
              onSelect={() => onSelectRegion(option.region)}
            />
          ))}
        </div>
      )}

      {/* A `key` zera o "ver mais" a cada troca de filtro: a lista recomeça do
          topo, não no meio da anterior. Chip sem jogo (Decisão do plano de
          sempre oferecer as quatro ligas) precisa dizer isso — a grade nunca
          fica um vazio mudo embaixo do chip que acabou de ser clicado. */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {selectedRegion
            ? `Nenhum jogo de ${regionLabel(selectedRegion)} agendado no momento.`
            : "Nenhum jogo confirmado no circuito agora."}
        </p>
      ) : (
        <ScheduleDays
          key={selectedRegion ?? "all"}
          matches={filtered}
          allMatches={matches}
          myOrganizations={myOrganizations}
          closesBy={closesBy}
          now={now}
        />
      )}
    </div>
  );
}

type ScheduleDaysProps = {
  matches: readonly RoundMatch[];
  /** A grade inteira: o destaque de "próximo" não muda por causa do filtro. */
  allMatches: readonly RoundMatch[];
  myOrganizations: readonly string[];
  closesBy: Map<string, Date>;
  now: Date;
};

function ScheduleDays({
  matches,
  allMatches,
  myOrganizations,
  closesBy,
  now,
}: ScheduleDaysProps) {
  const [limit, setLimit] = useState(VISIBLE_LIMIT);

  const visible = matches.slice(0, limit);
  const hidden = matches.length - visible.length;
  const step = Math.min(hidden, LOAD_MORE_STEP);

  const mine = new Set(myOrganizations);
  const days = groupMatchesByDay(visible, now);
  // Uma só ênfase na lista inteira, e vinda da grade completa: o próximo jogo
  // a começar é o mesmo esteja o filtro onde estiver.
  const nextId = nextMatchId(allMatches, now);

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
                      <EventOrigin
                        event={match.event}
                        regionCode={match.regionCode}
                      >
                        <MarketCell
                          closesAt={closesBy.get(match.id)}
                          now={now}
                        />
                      </EventOrigin>
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
          onClick={() => setLimit((current) => current + LOAD_MORE_STEP)}
          className="mt-4 w-full text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:text-primary"
        >
          Ver mais {step} {step === 1 ? "jogo" : "jogos"}
        </button>
      )}
    </>
  );
}

type MarketCellProps = {
  closesAt: Date | undefined;
  now: Date;
};

/**
 * O fechamento do mercado daquela partida. Fechado não some da lista: saber
 * que a janela passou é tão acionável quanto saber quanto falta — some a
 * ênfase, não a informação.
 */
function MarketCell({ closesAt, now }: MarketCellProps) {
  if (!closesAt) return null;

  const closed = closesAt.getTime() <= now.getTime();

  return (
    <time
      dateTime={toIsoDate(closesAt)}
      className={cn(
        "text-[10px] font-bold tracking-[0.1em] uppercase tabular-nums",
        closed ? "text-muted-foreground/70" : "text-primary/80",
      )}
    >
      {closed
        ? "Mercado fechado"
        : `Mercado fecha ${formatKickoffTime(closesAt)}`}
    </time>
  );
}
