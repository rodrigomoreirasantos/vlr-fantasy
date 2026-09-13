"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { respondToFriendRequest } from "@/app/(app)/profile/actions";
import { Button } from "@/components/ui/button";
import { useTimezone } from "@/components/layout/timezone";
import { formatInvitedAt } from "@/lib/championship/format";
import type { IncomingFriendRequest } from "@/lib/friendship/types";

export type FriendRequestsProps = {
  requests: IncomingFriendRequest[];
};

/** Pedidos de amizade recebidos pelo usuário, ainda sem resposta. Clone estrutural de `PendingInvites`. */
export function FriendRequests({ requests }: FriendRequestsProps) {
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const tz = useTimezone();

  const { execute, isExecuting } = useAction(respondToFriendRequest, {
    onSuccess: () => {
      toast.success("Pedido de amizade atualizado!");
      setRespondingId(null);
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? "Não foi possível responder ao pedido.");
      setRespondingId(null);
    },
  });

  if (requests.length === 0) return null;

  function respond(friendshipId: string, accept: boolean) {
    setRespondingId(friendshipId);
    execute({ friendshipId, accept });
  }

  return (
    <section
      aria-label="Pedidos de amizade"
      className="clip-corner mb-6 bg-card p-[18px] ring-1 ring-primary/40 [--clip:16px]"
    >
      <h2 className="mb-3.5 text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        Pedidos de amizade
      </h2>
      <ul className="flex flex-col gap-3">
        {requests.map((request) => {
          const disabled = isExecuting && respondingId === request.friendshipId;
          return (
            <li
              key={request.friendshipId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-semibold">
                  {request.requesterUsername
                    ? `@${request.requesterUsername}`
                    : request.requesterUserName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatInvitedAt(request.requestedAt, tz)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled}
                  onClick={() => respond(request.friendshipId, true)}
                >
                  Aceitar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => respond(request.friendshipId, false)}
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
