import type { CSSProperties } from "react";

import { Plus, TriangleAlert } from "lucide-react";

import { PlayerPhoto } from "@/components/player/player-photo";
import { PlayerScore } from "@/components/team/player-score";
import type { RosterSlot } from "@/lib/team/types";
import { cn } from "@/lib/utils";

type Position = {
  top: string;
  left: string;
  /** Qual borda do marcador se apoia em `left`. */
  anchor: "left" | "center" | "right";
};

/**
 * Posições em losango achatado, na ordem das vagas da escalação. Topos entre
 * 8% e 58% (plano 28, Fase 2): mais baixo que a versão anterior
 * (`pt-[78%]`, topos até 64%) para caber na mesma altura do painel "Resumo".
 * As vagas 2 e 3 (linha do meio) ficam em 22%/78% — mais para dentro que a
 * linha de baixo (8%/92%) — para desenhar um "V" de verdade entre as três
 * linhas em vez de uma coluna reta dos dois lados.
 */
const POSITIONS: Position[] = [
  { top: "8%", left: "50%", anchor: "center" },
  { top: "34%", left: "22%", anchor: "left" },
  { top: "34%", left: "78%", anchor: "right" },
  { top: "58%", left: "8%", anchor: "left" },
  { top: "58%", left: "92%", anchor: "right" },
];

const ANCHOR_TRANSFORM: Record<Position["anchor"], string> = {
  left: "none",
  center: "translateX(-50%)",
  right: "translateX(-100%)",
};

/**
 * Variáveis CSS que carregam a posição do marcador — só viram `top`/`left`/
 * `transform` de verdade a partir de `sm` (ver `MARKER_WRAPPER_CLASS`
 * abaixo). Abaixo de `sm` o marcador é um item de `flex-wrap` comum: nenhum
 * `style` de posição atua, e a formação vira 3 + 2 centralizados pelo
 * `justify-content` de cada linha — efeito nativo do flexbox, sem grid
 * manual nem duplicar o marcador em duas árvores (o que quebraria consultas
 * de teste por haver dois elementos com o mesmo texto/label).
 */
function markerStyle(position: Position): CSSProperties {
  return {
    "--m-top": position.top,
    "--m-left": position.left,
    "--m-x": ANCHOR_TRANSFORM[position.anchor],
  } as CSSProperties;
}

const MARKER_WRAPPER_CLASS =
  "relative flex w-16 shrink-0 flex-col items-center gap-[5px] sm:absolute sm:w-auto sm:shrink sm:top-[var(--m-top)] sm:left-[var(--m-left)] sm:[transform:var(--m-x)]";

function Marker({
  slot,
  position,
  index,
  onSelect,
  selected = false,
  onSetCaptain,
}: {
  slot: RosterSlot;
  position: Position;
  index: number;
  /** Presente só quando a vaga pode abrir o mercado (janela aberta). */
  onSelect?: (index: number) => void;
  selected?: boolean;
  /** Presente só quando o usuário pode trocar o capitão (mercado aberto). */
  onSetCaptain?: (index: number) => void;
}) {
  const { player, captain, warning } = slot;

  // Vaga cheia e vaga vazia são estados distintos o bastante para não
  // dividirem um `cn()` só — separá-los tira cinco guardas `player &&`.
  const circle = player ? (
    <PlayerPhoto
      photoUrl={player.photoUrl}
      nickname={player.nickname}
      shape="circle"
      size={48}
      className={cn(
        "ring-2",
        captain ? "ring-primary" : "ring-border",
        // O tabuleiro não pode contradizer a lista: o mesmo alerta de
        // `PlayerWarningBadge` (`components/team/player-row.tsx`) também
        // marca o círculo aqui.
        warning && "ring-destructive",
        selected && "ring-primary",
      )}
    />
  ) : (
    <div
      className={cn(
        "flex size-12 items-center justify-center rounded-full border border-dashed border-border text-border transition-colors",
        onSelect && "group-hover:border-primary group-hover:text-primary",
        selected && "border-primary text-primary",
      )}
    >
      <Plus aria-hidden className="size-5" />
    </div>
  );

  return (
    <div style={markerStyle(position)} className={MARKER_WRAPPER_CLASS}>
      <div className="relative">
        {onSelect ? (
          <button
            type="button"
            onClick={() => onSelect(index)}
            aria-haspopup="dialog"
            aria-expanded={selected}
            aria-label={
              player
                ? `Substituir ${player.nickname} no campo`
                : `Adicionar jogador na vaga ${index + 1} no campo`
            }
            className="group block cursor-pointer rounded-full transition-transform hover:scale-105"
          >
            {circle}
          </button>
        ) : (
          circle
        )}
        {player &&
          (onSetCaptain ? (
            <button
              type="button"
              onClick={() => onSetCaptain(index)}
              aria-pressed={captain}
              aria-label={
                captain
                  ? `${player.nickname} é o capitão no campo`
                  : `Tornar ${player.nickname} capitão no campo`
              }
              title={captain ? "Capitão" : "Tornar capitão"}
              className={cn(
                "absolute -top-1 -left-1 flex size-[18px] cursor-pointer items-center justify-center rounded-full text-[9px] font-extrabold transition-colors",
                captain
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground",
              )}
            >
              C
            </button>
          ) : (
            captain && (
              <span
                aria-label="Capitão"
                title="Capitão"
                className="absolute -top-1 -left-1 flex size-[18px] items-center justify-center rounded-full bg-primary text-[9px] font-extrabold text-primary-foreground"
              >
                C
              </span>
            )
          ))}
        {player && warning && (
          <span
            aria-label="Fora do escopo do time"
            title="Fora do escopo do time"
            className="absolute -top-1 -right-1 flex size-[18px] items-center justify-center rounded-full bg-card text-destructive ring-1 ring-destructive"
          >
            <TriangleAlert aria-hidden className="size-2.5" />
          </span>
        )}
      </div>

      {player ? (
        <>
          <PlayerScore score={player.score} surface="card" size="sm" />
          <p className="w-full truncate text-center text-[11px] font-bold uppercase">
            {player.nickname}
          </p>
        </>
      ) : (
        <p className="text-[11px] font-semibold text-muted-foreground">
          Slot {index + 1}
        </p>
      )}
    </div>
  );
}

export type FormationBoardProps = {
  roster: RosterSlot[];
  /** Presente só quando a vaga pode abrir o mercado (janela aberta). */
  onSelect?: (index: number) => void;
  selectedIndex?: number | null;
  /** Presente só quando o usuário pode trocar o capitão (mercado aberto). */
  onSetCaptain?: (index: number) => void;
};

/**
 * O time disposto em campo, como o usuário o montou.
 *
 * Abaixo de `sm`: `flex flex-wrap justify-center` — com 5 marcadores de
 * largura fixa, o próprio flexbox quebra em 3 + 2 e centraliza cada linha
 * (comportamento nativo de `justify-content` em contêineres com quebra),
 * sem precisar de grid manual. De `sm` em diante os marcadores flutuam em
 * posição absoluta (`POSITIONS`) sobre uma altura fixa — a mesma ideia do
 * tabuleiro antigo, só que baixa o bastante para bater com a altura do
 * "Resumo" ao lado (`components/team/roster-panel.tsx`).
 */
export function FormationBoard({
  roster,
  onSelect,
  selectedIndex = null,
  onSetCaptain,
}: FormationBoardProps) {
  return (
    <div className="relative flex w-full flex-wrap content-center justify-center gap-x-6 gap-y-5 overflow-hidden bg-card p-4 ring-1 ring-border sm:block sm:h-[300px] sm:p-0 lg:h-full lg:min-h-[320px]">
      {/* Detalhe tático discreto — o tabuleiro não pode parecer um vazio na
          versão mais baixa. Puramente decorativo, atrás dos marcadores. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, var(--color-border) 0, var(--color-border) 1px, transparent 1px, transparent 24px)",
        }}
      />

      {roster.slice(0, POSITIONS.length).map((slot, index) => (
        <Marker
          key={slot.player?.id ?? `slot-${index}`}
          slot={slot}
          position={POSITIONS[index]}
          index={index}
          onSelect={onSelect}
          selected={index === selectedIndex}
          onSetCaptain={onSetCaptain}
        />
      ))}
    </div>
  );
}
