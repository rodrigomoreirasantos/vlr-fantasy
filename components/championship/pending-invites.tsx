"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { respondToInvite } from "@/app/(app)/ranking/actions";
import { Button } from "@/components/ui/button";
import { formatInvitedAt } from "@/lib/championship/format";
import type { PendingInvite } from "@/lib/championship/types";
import { regionColor, regionLabel } from "@/lib/round/regions";

export type PendingInvitesProps = {
  invites: PendingInvite[];
};

/** Convites de campeonato recebidos pelo usuário, ainda sem resposta. */
export function PendingInvites({ invites }: PendingInvitesProps) {
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const { execute, isExecuting } = useAction(respondToInvite, {
    onSuccess: () => {
      toast.success("Convite atualizado!");
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

  function respond(memberId: string, accept: boolean) {
    setRespondingId(memberId);
    execute({ memberId, accept });
  }

  return (
    <section
      aria-label="Convites pendentes"
      className="clip-corner mb-6 bg-card p-[18px] ring-1 ring-primary/40 [--clip:16px]"
    >
      <h2 className="mb-3.5 text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        Convites pendentes
      </h2>
      <ul className="flex flex-col gap-3">
        {invites.map((invite) => {
          const disabled = isExecuting && respondingId === invite.memberId;
          return (
            <li
              key={invite.memberId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2.5"
            >
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
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
                  {formatInvitedAt(invite.invitedAt)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Você entra com o seu time de {regionLabel(invite.region)}.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled}
                  onClick={() => respond(invite.memberId, true)}
                >
                  Aceitar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => respond(invite.memberId, false)}
                >
                  Recusar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
