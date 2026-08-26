import { Plus } from "lucide-react";

import { PlayerScore } from "@/components/team/player-score";
import type { Player } from "@/lib/team/types";
import { cn } from "@/lib/utils";

export type CaptainBadgeProps = {
  nickname: string;
  captain: boolean;
  /** Presente só quando o usuário pode trocar o capitão (mercado aberto). */
  onSetCaptain?: () => void;
  className?: string;
};

/**
 * A braçadeira de capitão. Sem `onSetCaptain` é só um selo, visível apenas
 * em quem já é capitão. Com `onSetCaptain` aparece em **todo** jogador da
 * escalação — preenchida em quem já é capitão, contornada nos demais — e
 * vira um botão: clicar torna aquele jogador o capitão do time na hora.
 *
 * Fica fora do botão de "Substituir" de propósito — ver `PlayerPortraitBadge`
 * — porque um `<button>` dentro de outro `<button>` é HTML inválido.
 */
export function CaptainBadge({
  nickname,
  captain,
  onSetCaptain,
  className,
}: CaptainBadgeProps) {
  if (!onSetCaptain) {
    if (!captain) return null;
    return (
      <span
        aria-label="Capitão"
        title="Capitão"
        className={cn(
          "absolute -top-1 -left-1 flex size-4 items-center justify-center bg-primary text-[9px] font-extrabold text-primary-foreground",
          className,
        )}
      >
        C
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onSetCaptain}
      aria-pressed={captain}
      aria-label={
        captain ? `${nickname} é o capitão` : `Tornar ${nickname} capitão`
      }
      title={captain ? "Capitão" : "Tornar capitão"}
      className={cn(
        "absolute -top-1 -left-1 flex size-4 cursor-pointer items-center justify-center text-[9px] font-extrabold transition-colors",
        captain
          ? "bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground",
        className,
      )}
    >
      C
    </button>
  );
}

/** Retrato do jogador. Placeholder hachurado até existirem imagens. */
function PlayerPortrait({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "clip-corner bg-accent [--clip:6px] [background-image:repeating-linear-gradient(135deg,var(--accent)_0_4px,var(--muted)_4px_8px)]",
        className,
      )}
    />
  );
}

export type PlayerPortraitBadgeProps = {
  player: Player;
  captain?: boolean;
  onSetCaptain?: () => void;
};

/**
 * Retrato com a braçadeira de capitão sobreposta. Fica fora do botão de
 * "Substituir" — ver `CaptainBadge` — daí ser um componente à parte de
 * `PlayerIdentity`, e não mais aninhado nela.
 */
export function PlayerPortraitBadge({
  player,
  captain = false,
  onSetCaptain,
}: PlayerPortraitBadgeProps) {
  return (
    <div className="relative flex-none">
      <PlayerPortrait className="size-[46px]" />
      <CaptainBadge
        nickname={player.nickname}
        captain={captain}
        onSetCaptain={onSetCaptain}
      />
    </div>
  );
}

export type PlayerIdentityProps = {
  player: Player;
};

/**
 * Nome, organização, agente/função e pontuação de um jogador — sem o
 * retrato (ver `PlayerPortraitBadge`). Compartilhado entre "Meu Time" e o
 * mercado de transferências.
 */
export function PlayerIdentity({ player }: PlayerIdentityProps) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold uppercase">
          {player.nickname}
        </p>
        <p className="mt-[3px] flex items-center gap-1.5">
          <span className="bg-card px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {player.team}
          </span>
          <span className="text-[10px] font-semibold text-info uppercase">
            {player.agent} · {player.role}
          </span>
        </p>
      </div>

      <PlayerScore
        score={player.score}
        surface="secondary"
        className="clip-corner flex-none [--clip:6px]"
      />
    </>
  );
}

export type PlayerRowProps = {
  player: Player;
  captain?: boolean;
  /** Presente só quando a vaga pode abrir o mercado (janela aberta). */
  onSelect?: () => void;
  selected?: boolean;
  /** Presente só quando o usuário pode trocar o capitão (mercado aberto). */
  onSetCaptain?: () => void;
};

/**
 * Linha compacta de jogador: retrato, identidade e pontuação. Compartilhada
 * entre "Meu Time" e o mercado de transferências. Sem `onSelect` é uma linha
 * inerte; com `onSelect` vira um botão que abre o mercado para essa vaga. A
 * braçadeira de capitão (`onSetCaptain`) é um botão à parte, ao lado — não
 * dentro — do de substituir.
 */
export function PlayerRow({
  player,
  captain = false,
  onSelect,
  selected = false,
  onSetCaptain,
}: PlayerRowProps) {
  const identity = <PlayerIdentity player={player} />;

  return (
    <li
      className={cn(
        "clip-corner flex items-center gap-2.5 bg-secondary px-3 py-2.5 ring-1 transition-colors [--clip:10px]",
        // O hover mora aqui, não no botão de "Substituir": ele só cobre a
        // metade direita da linha (a braçadeira de capitão fica fora dele,
        // como um botão irmão), mas o card inteiro deve acender no hover.
        // `has-[>button:hover]` casa só com esse botão — filho direto do
        // `<li>` — e não com o botão da braçadeira, que fica um nível mais
        // fundo dentro do retrato.
        onSelect &&
          "has-[>button:hover]:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)]",
        captain ? "ring-primary/40" : "ring-border",
        selected && "ring-primary",
      )}
    >
      <PlayerPortraitBadge
        player={player}
        captain={captain}
        onSetCaptain={onSetCaptain}
      />

      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          aria-haspopup="dialog"
          aria-expanded={selected}
          aria-label={`Substituir ${player.nickname}`}
          className="flex flex-1 cursor-pointer items-center gap-2.5 text-left"
        >
          {identity}
        </button>
      ) : (
        <div className="flex flex-1 items-center gap-2.5">{identity}</div>
      )}
    </li>
  );
}

/** Vaga ainda não preenchida na escalação. */
export type EmptyPlayerRowProps = {
  position: number;
  /** Presente só quando a vaga pode abrir o mercado (janela aberta). */
  onSelect?: () => void;
  selected?: boolean;
};

export function EmptyPlayerRow({
  position,
  onSelect,
  selected = false,
}: EmptyPlayerRowProps) {
  const content = (
    <>
      <span
        className={cn(
          "flex size-[46px] flex-none items-center justify-center rounded-sm border border-dashed border-border text-border transition-colors",
          onSelect && "group-hover:border-primary group-hover:text-primary",
        )}
      >
        <Plus aria-hidden className="size-5" />
      </span>
      <span className="text-xs text-muted-foreground">
        Adicionar jogador
        <span className="block text-[10px] uppercase">Vaga {position}</span>
      </span>
    </>
  );

  return (
    <li
      className={cn(
        "clip-corner border border-dashed border-border bg-secondary/40 [--clip:10px]",
        selected && "border-primary",
      )}
    >
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          aria-haspopup="dialog"
          aria-expanded={selected}
          aria-label={`Adicionar jogador na vaga ${position}`}
          className="group flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-center gap-2.5 px-3 py-2.5">{content}</div>
      )}
    </li>
  );
}
