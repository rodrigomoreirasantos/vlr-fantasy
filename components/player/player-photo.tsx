import Image from "next/image";

import { cn } from "@/lib/utils";

export type PlayerPhotoProps = {
  /** `null` para quem nunca foi visto num elenco do vlr — fica só a hachura. */
  photoUrl: string | null;
  /** Só entra no `alt`/`title` da moldura — a foto em si é decorativa (ver abaixo). */
  nickname: string;
  /** Lado do quadrado em px — `next/image` exige width/height numéricos. */
  size: number;
  /** `corner` = chanfro do Valorant (padrão); `circle` = o marcador do campo. */
  shape?: "corner" | "circle";
  /** Tamanho do chanfro, em px. Ignorado quando `shape === "circle"`. */
  clip?: number;
  className?: string;
};

/**
 * O retrato de um jogador — mercado, escalação, campo e Home compartilham o
 * mesmo componente (regra do CLAUDE.md: componente de jogador reutilizável
 * entre "Meu Time" e "Mercado"), no precedente de `components/crest/`.
 *
 * **A hachura não é um `else` — é o fundo permanente da caixa.** O `<div>`
 * externo sempre carrega o tramado hachurado; a foto entra por cima só
 * quando há `photoUrl`. Isso cobre de graça três casos: a foto do vlr é um
 * PNG recortado com fundo transparente (a hachura vira o backdrop); o
 * intervalo de carregamento (sem precisar de `skeleton`); e uma falha do
 * otimizador (sobra a hachura, nunca um buraco).
 *
 * **`width`/`height` numéricos, nunca `fill`**: `fill` exige um pai
 * `relative`, e em `PlayerPortraitBadge` esse pai já é o dono do
 * `CaptainBadge` absoluto — empilhar os dois é pedir conflito de posição.
 *
 * **Decorativa por design**: `alt=""` + `aria-hidden`, porque em todo call
 * site o nickname já está adjacente no DOM — sem isso o leitor de tela
 * anunciaria o nome duas vezes. `data-slot` é o gancho de teste, já que
 * `getByRole("img")` não acha nada aqui.
 */
export function PlayerPhoto({
  photoUrl,
  nickname,
  size,
  shape = "corner",
  clip = 6,
  className,
}: PlayerPhotoProps) {
  return (
    <div
      data-slot="player-photo"
      title={nickname}
      style={
        {
          width: size,
          height: size,
          ...(shape === "corner" ? { "--clip": `${clip}px` } : {}),
        } as React.CSSProperties
      }
      className={cn(
        "relative flex-none bg-accent [background-image:repeating-linear-gradient(135deg,var(--accent)_0_4px,var(--muted)_4px_8px)]",
        shape === "corner" ? "clip-corner" : "rounded-full overflow-hidden",
        className,
      )}
    >
      {photoUrl && (
        <Image
          src={photoUrl}
          alt=""
          aria-hidden
          width={size}
          height={size}
          className="size-full object-cover"
        />
      )}
    </div>
  );
}
