import { shortEventLabel } from "@/lib/round/events";
import { eventRegion, regionColor, regionLabel } from "@/lib/round/regions";

export type EventOriginProps = {
  event: string;
  /** A bandeira do vlr, quando o chamador a tem — reforça a região. */
  regionCode?: string | null;
  /** Conteúdo extra sob o nome do campeonato — o horário, por exemplo. */
  children?: React.ReactNode;
};

/**
 * De onde é uma partida: a região em destaque e, embaixo, o nome curto do
 * campeonato.
 *
 * Antes era só o nome cru e apagado — `"Champions Tour 2026: Americas Stage
 * 2"` em `text-muted-foreground`, que obriga a ler a linha inteira para
 * descobrir a liga. A região vem primeiro porque é o recorte pelo qual se
 * procura; o nome longo continua no `title`, para quem quiser o detalhe.
 *
 * Vive aqui, e não dentro de uma das telas, porque o calendário e os placares
 * das suas partidas mostram exatamente o mesmo selo.
 */
export function EventOrigin({ event, regionCode, children }: EventOriginProps) {
  const region = eventRegion(event, regionCode);

  return (
    <span className="flex flex-col items-end text-right">
      <span
        className="text-[10px] font-bold tracking-[0.12em] uppercase"
        style={{ color: regionColor(region) }}
      >
        {regionLabel(region)}
      </span>
      <span title={event} className="text-[11px] text-muted-foreground">
        {shortEventLabel(event)}
      </span>
      {children}
    </span>
  );
}
