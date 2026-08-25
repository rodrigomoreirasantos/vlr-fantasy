import { PlayerScore } from "@/components/team/player-score";
import type { RosterSlot } from "@/lib/team/types";
import { cn } from "@/lib/utils";

type Position = {
  top: string;
  left: string;
  /** Qual borda do marcador se apoia em `left`. */
  anchor: "left" | "center" | "right";
};

/** Posições em losango, na ordem das vagas da escalação. */
const POSITIONS: Position[] = [
  { top: "6%", left: "50%", anchor: "center" },
  { top: "30%", left: "16%", anchor: "left" },
  { top: "26%", left: "78%", anchor: "right" },
  { top: "60%", left: "4%", anchor: "left" },
  { top: "64%", left: "98%", anchor: "right" },
];

const anchorTransform = {
  left: undefined,
  center: "translateX(-50%)",
  right: "translateX(-100%)",
} as const;

function Marker({
  slot,
  position,
  index,
  onSelect,
  selected = false,
}: {
  slot: RosterSlot;
  position: Position;
  index: number;
  /** Presente só quando a vaga pode abrir o mercado (janela aberta). */
  onSelect?: (index: number) => void;
  selected?: boolean;
}) {
  const { player, captain } = slot;

  const circle = (
    <div
      className={cn(
        "size-14 rounded-full",
        player
          ? "ring-2 [background-image:repeating-linear-gradient(135deg,var(--accent)_0_4px,var(--muted)_4px_8px)]"
          : "border border-dashed border-border",
        player && (captain ? "ring-primary" : "ring-border"),
        player && selected && "ring-primary",
      )}
    />
  );

  return (
    <div
      style={{
        top: position.top,
        left: position.left,
        transform: anchorTransform[position.anchor],
      }}
      className="absolute flex flex-col items-center gap-[5px]"
    >
      <div className="relative">
        {player && onSelect ? (
          <button
            type="button"
            onClick={() => onSelect(index)}
            aria-haspopup="dialog"
            aria-expanded={selected}
            aria-label={`Substituir ${player.nickname} no campo`}
            className="block cursor-pointer rounded-full transition-transform hover:scale-105"
          >
            {circle}
          </button>
        ) : (
          circle
        )}
        {captain && (
          <span
            aria-label="Capitão"
            title="Capitão"
            className="absolute -top-1 -left-1 flex size-[18px] items-center justify-center rounded-full bg-primary text-[9px] font-extrabold text-primary-foreground"
          >
            C
          </span>
        )}
      </div>

      {player ? (
        <>
          <PlayerScore score={player.score} surface="card" size="sm" />
          <p className="text-[11px] font-bold uppercase">{player.nickname}</p>
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
};

/** O time disposto em campo, como o usuário o montou. */
export function FormationBoard({
  roster,
  onSelect,
  selectedIndex = null,
}: FormationBoardProps) {
  return (
    <div className="relative w-full overflow-hidden bg-card pt-[78%] ring-1 ring-border">
      {roster.slice(0, POSITIONS.length).map((slot, index) => (
        <Marker
          key={slot.player?.id ?? `slot-${index}`}
          slot={slot}
          position={POSITIONS[index]}
          index={index}
          onSelect={onSelect}
          selected={index === selectedIndex}
        />
      ))}
    </div>
  );
}
