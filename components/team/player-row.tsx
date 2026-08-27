import { HandCoins, Plus } from "lucide-react";

import { PlayerScore } from "@/components/team/player-score";
import { Button } from "@/components/ui/button";
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
  /**
   * Conteúdo à direita do nome — por padrão, a pontuação da rodada. O
   * mercado troca por `PlayerPrice` (o preço atual), porque a pontuação de
   * um candidato não é a informação relevante ali. Ver
   * `components/market/market-player-row.tsx`.
   */
  trailing?: React.ReactNode;
};

/**
 * Nome, organização, função e pontuação de um jogador — sem o retrato (ver
 * `PlayerPortraitBadge`). Compartilhado entre "Meu Time" e o mercado de
 * transferências.
 *
 * O agente não aparece: numa linha estreita ele disputava espaço com a
 * função sem ajudar nenhuma das duas decisões que a linha suporta
 * (substituir e vender). A função fica, porque é ela que organiza o mercado.
 */
export function PlayerIdentity({ player, trailing }: PlayerIdentityProps) {
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
            {player.role}
          </span>
        </p>
      </div>

      {trailing ?? (
        <PlayerScore
          score={player.score}
          surface="secondary"
          unit="PTS"
          className="clip-corner flex-none [--clip:6px]"
        />
      )}
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
  /**
   * Presente só quando o usuário pode vender esse jogador (mercado aberto).
   * Vende direto, sem abrir o mercado — ação de primeira classe, não mais
   * escondida atrás do painel de substituição.
   */
  onSell?: () => void;
};

/**
 * Linha compacta de jogador: retrato, identidade e pontuação. Compartilhada
 * entre "Meu Time" e o mercado de transferências. Sem `onSelect` é uma linha
 * inerte; com `onSelect` vira um botão que abre o mercado para essa vaga. A
 * braçadeira de capitão (`onSetCaptain`) e o botão de vender (`onSell`) são
 * botões irmãos, fora do de substituir — nunca aninhados, porque um
 * `<button>` dentro de outro `<button>` é HTML inválido.
 */
export function PlayerRow({
  player,
  captain = false,
  onSelect,
  selected = false,
  onSetCaptain,
  onSell,
}: PlayerRowProps) {
  const identity = <PlayerIdentity player={player} />;

  return (
    <li
      className={cn(
        "clip-corner flex items-center gap-2.5 bg-secondary px-3 py-2.5 ring-1 transition-colors [--clip:10px]",
        // O hover mora aqui, não no botão de "Substituir": ele só cobre a
        // metade direita da linha (a braçadeira de capitão fica fora dele,
        // como um botão irmão), mas o card inteiro deve acender no hover.
        // `data-slot="substitute"` escopa o seletor só a esse botão — com o
        // de "Vender" também como filho direto do `<li>`, um `has-[>button:hover]`
        // genérico acenderia o card ao passar o mouse sobre "Vender" também,
        // o que não faz sentido (vender não abre o mercado).
        onSelect &&
          "has-[>[data-slot=substitute]:hover]:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)]",
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
          data-slot="substitute"
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

      {onSell && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          // Neutro em repouso, destrutivo só no hover/foco. Preenchido de
          // vermelho ele empatava com o chip de pontuação ruim, que usa
          // `--primary` (#ff4655) — quase o mesmo tom de `--destructive`
          // (#e0303f) —, e o usuário não distinguia o dado da ação. A borda
          // do `outline` mantém o botão achável; a cor entra na intenção.
          className="flex-none text-muted-foreground hover:border-destructive/40 hover:bg-destructive/15 hover:text-destructive focus-visible:border-destructive/40 focus-visible:text-destructive"
          aria-label={`Vender ${player.nickname}`}
          onClick={onSell}
        >
          <HandCoins aria-hidden />
          Vender
        </Button>
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
