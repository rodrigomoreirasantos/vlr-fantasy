"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { removeFriend } from "@/app/(app)/profile/actions";
import { TeamCrest } from "@/components/crest/team-crest";
import { InviteFriendDialog } from "@/components/profile/invite-friend-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ChampionshipSummary } from "@/lib/championship/types";
import type { Friend } from "@/lib/friendship/types";

export type FriendsListProps = {
  friends: Friend[];
  /** Campeonatos próprios, repassados ao `InviteFriendDialog` de cada card. */
  ownedChampionships: ChampionshipSummary[];
};

/** Um card por amigo: brasão, time e login, com as ações "Convidar" e "Remover". */
export function FriendsList({ friends, ownedChampionships }: FriendsListProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const { execute, isExecuting } = useAction(removeFriend, {
    onSuccess: () => {
      toast.success("Amizade removida.");
      setConfirmingId(null);
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? "Não foi possível remover a amizade.");
      setConfirmingId(null);
    },
  });

  if (friends.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Você ainda não tem amigos. Convide alguém pelo login.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {friends.map((friend) => (
        <li
          key={friend.friendshipId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2.5"
        >
          <div className="flex items-center gap-3">
            <TeamCrest
              crest={friend.crest}
              size="sm"
              title={`Brasão de ${friend.teamName}`}
            />
            <div>
              <p className="text-sm font-semibold">{friend.teamName}</p>
              <p className="text-xs text-muted-foreground">
                {friend.username ? `@${friend.username}` : friend.userName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <InviteFriendDialog
              friend={friend}
              ownedChampionships={ownedChampionships}
            />

            <Dialog
              open={confirmingId === friend.friendshipId}
              onOpenChange={(next) =>
                setConfirmingId(next ? friend.friendshipId : null)
              }
            >
              <DialogTrigger asChild>
                <Button type="button" size="sm" variant="outline">
                  Remover
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Remover amizade?</DialogTitle>
                  <DialogDescription>
                    Você não vai mais aparecer na lista de amigos de{" "}
                    {friend.userName}, e vice-versa.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Cancelar
                    </Button>
                  </DialogClose>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isExecuting}
                    onClick={() =>
                      execute({ friendshipId: friend.friendshipId })
                    }
                  >
                    {isExecuting ? "Removendo…" : "Remover"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </li>
      ))}
    </ul>
  );
}
