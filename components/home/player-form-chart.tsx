"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  buildFormSeries,
  metricLabel,
  type FormMetric,
} from "@/lib/player/form";
import type { PlayerMatchPerformance } from "@/lib/player/types";
import { formatMatchKickoff } from "@/lib/round/format";
import { cn } from "@/lib/utils";

/**
 * Quantas partidas o gráfico mostra por jogador. Cinco é o que o histórico
 * real sustenta hoje (o backfill cobre ~2 semanas) e o que ainda se lê num
 * eixo estreito no celular.
 */
export const FORM_WINDOW = 5;

/** As cinco séries, na ordem em que `app/globals.css` as define. */
const SERIES_TOKENS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

/**
 * A cor de um jogador, pela posição dele **na escalação** — a mesma ordem que
 * `/my-team` mostra.
 *
 * Uma fonte só de propósito: o gráfico ordena as séries por nickname e os
 * chips seguem a escalação, então derivar a cor de cada um da sua própria
 * ordem daria um ponto verde num chip cuja linha é vermelha.
 */
export function seriesColor(
  roster: readonly { playerId: string }[],
  playerId: string,
): string {
  const index = roster.findIndex((slot) => slot.playerId === playerId);
  return SERIES_TOKENS[(index < 0 ? 0 : index) % SERIES_TOKENS.length]!;
}

export type PlayerFormChartProps = {
  performances: readonly PlayerMatchPerformance[];
  /** Os seus 5, na ordem da escalação — define a cor de cada linha. */
  roster: readonly { playerId: string; nickname: string }[];
  metric: FormMetric;
  /** `null` = todos. Filtrar esconde a linha; nunca refaz a consulta. */
  selectedPlayerId: string | null;
};

/**
 * A forma recente dos seus 5 — uma linha por jogador, alinhadas por recência.
 *
 * O eixo X não é uma data: jogadores de ligas diferentes jogam em dias
 * diferentes, e um eixo cronológico daria cinco linhas tracejadas que nunca se
 * cruzam. "J-4 … Último" põe todo mundo na mesma régua — quantos jogos atrás —
 * e é o que transforma isto numa comparação de forma. O tooltip diz, ponto a
 * ponto, contra quem foi e quando.
 */
export function PlayerFormChart({
  performances,
  roster,
  metric,
  selectedPlayerId,
}: PlayerFormChartProps) {
  const { points, series } = buildFormSeries(performances, metric, FORM_WINDOW);

  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum dos seus jogadores entrou em quadra ainda. O gráfico aparece
        depois da primeira partida deles.
      </p>
    );
  }

  const visible = selectedPlayerId
    ? series.filter((row) => row.playerId === selectedPlayerId)
    : series;

  const config: ChartConfig = Object.fromEntries(
    series.map((row) => [
      row.playerId,
      { label: row.nickname, color: seriesColor(roster, row.playerId) },
    ]),
  );

  // Recharts lê linhas planas; `buildFormSeries` guarda os valores num objeto
  // aninhado para manter a regra pura legível.
  const data = points.map((point) => ({ label: point.label, ...point.values }));

  return (
    <div>
      {/* `aria-hidden`: os `<text>` dos eixos entram na árvore de
          acessibilidade soltos, e o leitor de tela leria os mesmos números
          duas vezes — uma delas sem contexto. Quem conta a história para ele é
          a `<FormTable>` abaixo. */}
      <ChartContainer
        aria-hidden
        config={config}
        className="aspect-auto h-56 w-full sm:h-64"
      >
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          {/* Só linhas horizontais: uma grade vertical competiria com os
              rótulos do eixo, que já marcam cada jogo. */}
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            tick={<FormTick />}
          />
          <YAxis
            width={38}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            className="text-[10px]"
          />
          <ChartTooltip
            cursor={{ stroke: "var(--border)" }}
            content={<FormTooltip points={points} metric={metric} />}
          />
          {visible.map((row) => (
            <Line
              key={row.playerId}
              dataKey={row.playerId}
              type="monotone"
              stroke={`var(--color-${row.playerId})`}
              strokeWidth={2}
              // Ponto só no que está sob o cursor: cinco linhas pontilhadas
              // viram confete e escondem justamente a forma que se quer ler.
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              // Quem jogou menos deixa buraco à esquerda; ligar os pontos
              // mente sobre um jogo que não houve.
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>

      <FormTable points={points} series={visible} metric={metric} />
    </div>
  );
}

type FormTickProps = {
  x?: number;
  y?: number;
  payload?: { value?: string };
};

/**
 * O rótulo do eixo na mesma micro-tipografia das seções da Home. "Último" vem
 * em vermelho: entre os cinco jogos, o mais recente é o que responde "como ele
 * está agora", e é o único que a tela precisa apontar.
 */
function FormTick({ x = 0, y = 0, payload }: FormTickProps) {
  const value = payload?.value ?? "";
  const latest = value === "Último";

  return (
    <text
      x={x}
      y={y}
      dy={10}
      textAnchor="middle"
      className={cn(
        "text-[10px] font-bold tracking-[0.14em] uppercase",
        latest ? "fill-primary" : "fill-muted-foreground",
      )}
    >
      {value}
    </text>
  );
}

type FormTooltipProps = {
  points: ReturnType<typeof buildFormSeries>["points"];
  metric: FormMetric;
  active?: boolean;
  label?: string;
  payload?: Array<{
    dataKey?: string | number;
    value?: number;
    color?: string;
  }>;
};

/**
 * O tooltip diz **qual partida foi**, não só o número. Num eixo de recência,
 * "J-2" sozinho não localiza nada; "vs. LOUD · qua, 03/09 às 21:00" localiza.
 */
function FormTooltip({
  points,
  metric,
  active,
  label,
  payload,
}: FormTooltipProps) {
  if (!active || !payload?.length) return null;

  const point = points.find((row) => row.label === label);

  return (
    <div className="clip-corner min-w-44 bg-popover px-3 py-2 ring-1 ring-border [--clip:8px]">
      <p className="mb-1.5 text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        {label} · {metricLabel(metric)}
      </p>
      <ul className="flex flex-col gap-1">
        {payload.map((item) => {
          const playerId = String(item.dataKey);
          const played = point?.matches[playerId];

          return (
            <li key={playerId} className="flex items-baseline gap-2 text-xs">
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="flex flex-1 flex-col">
                <span className="text-muted-foreground">
                  {played ? `vs. ${played.opponent}` : "—"}
                </span>
                {played && (
                  // A data vem por jogador: no eixo de recência, o "J-2" de um
                  // é de outro dia que o "J-2" do outro.
                  <span className="text-[10px] text-muted-foreground/70">
                    {formatMatchKickoff(played.scheduledAt)}
                  </span>
                )}
              </span>
              <span className="font-bold tabular-nums">{item.value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type FormTableProps = {
  points: ReturnType<typeof buildFormSeries>["points"];
  series: ReturnType<typeof buildFormSeries>["series"];
  metric: FormMetric;
};

/**
 * Os mesmos números em tabela, só para leitor de tela. Um SVG de linhas não se
 * lê em voz alta, e um `aria-label` com "gráfico de desempenho" descreveria a
 * forma sem entregar o conteúdo.
 */
function FormTable({ points, series, metric }: FormTableProps) {
  return (
    <table className="sr-only">
      <caption>
        {metricLabel(metric)} por partida, do mais antigo ao mais recente
      </caption>
      <thead>
        <tr>
          <th scope="col">Jogador</th>
          {points.map((point) => (
            <th key={point.label} scope="col">
              {point.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {series.map((row) => (
          <tr key={row.playerId}>
            <th scope="row">{row.nickname}</th>
            {points.map((point) => (
              <td key={point.label}>
                {point.values[row.playerId] ?? "sem jogo"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
