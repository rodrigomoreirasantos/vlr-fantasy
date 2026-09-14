"use client";

import { useRef, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { respondToInvite } from "@/app/(app)/ranking/actions";
import { Button } from "@/components/ui/button";
import { useTimezone } from "@/components/layout/timezone";
import { formatInvitedAt } from "@/lib/championship/format";
import type { PendingInvite } from "@/lib/championship/types";
import { regionColor, regionLabel } from "@/lib/round/regions";

export type PendingInvitesProps = {
  invites: PendingInvite[];
};

/**
 * Quantos convites aparecem antes do "Ver todos" — com mais que isso a
 * seção empurrava a classificação para fora da primeira tela do celular.
 */
export const VISIBLE_INVITES = 2;

/** Convites de campeonato recebidos pelo usuário, ainda sem resposta. */
export function PendingInvites({ invites }: PendingInvitesProps) {
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  // A mensagem é montada no clique: quando o `onSuccess` roda, a revalidação
  // do `/ranking` pode já ter tirado o convite da lista (e o nome junto).
  const successMessage = useRef("");
  const tz = useTimezone();

  const { execute, isExecuting } = useAction(respondToInvite, {
    onSuccess: () => {
      toast.success(successMessage.current);
      setRespondingId(null);
    },
    onError: ({ error }) => {
      toast.error(
        error.serverError ?? "Não foi possível responder ao convite.",
      );
      setRespondingId(null);
    },
  });

  if (invites.length === 0) return null;

  function respond(invite: PendingInvite, accept: boolean) {
    successMessage.current = accept
      ? `Você entrou em ${invite.championshipName}.`
      : `Convite para ${invite.championshipName} recusado.`;
    setRespondingId(invite.memberId);
    execute({ memberId: invite.memberId, accept });
  }

  const hiddenCount = invites.length - VISIBLE_INVITES;
  const visible = expanded ? invites : invites.slice(0, VISIBLE_INVITES);

  return (
    <section
      aria-label="Convites pendentes"
      className="clip-corner mb-6 bg-card p-[18px] ring-1 ring-primary/40 [--clip:16px]"
    >
      <h2 className="mb-3.5 text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        Convites pendentes
        <span className="ml-1.5 text-primary tabular-nums">{invites.length}</span>
      </h2>
      <ul id="pending-invites-list" className="flex flex-col gap-2 sm:gap-3">
        {visible.map((invite) => {
          const disabled = isExecuting && respondingId === invite.memberId;
          return (
            <li
              key={invite.memberId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold">
                  {invite.championshipName}
                  <span
                    className="flex items-center gap-1 text-[10px] font-bold tracking-wide text-muted-foreground uppercase"
                    style={{ color: regionColor(invite.region) }}
                  >
                    <span
                      aria-hidden
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: regionColor(invite.region) }}
                    />
                    {regionLabel(invite.region)}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {invite.invitedByUsername &&
                    `de @${invite.invitedByUsername} · `}
                  {formatInvitedAt(invite.invitedAt, tz)}
                </p>
                {/* No celular a região já está no chip ao lado do nome — esta
                    linha só repetiria a informação num espaço apertado. */}
                <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
                  Você entra com o seu time de {regionLabel(invite.region)}.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled}
                  onClick={() => respond(invite, true)}
                >
                  Aceitar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => respond(invite, false)}
                >
                  Recusar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls="pending-invites-list"
          onClick={() => setExpanded((open) => !open)}
          className="mt-2 w-full text-muted-foreground"
        >
          {expanded
            ? "Mostrar menos"
            : `Ver todos os convites (+${hiddenCount})`}
        </Button>
      )}
    </section>
  );
}
