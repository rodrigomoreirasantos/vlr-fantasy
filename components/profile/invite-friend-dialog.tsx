"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { inviteFriendToChampionship } from "@/app/(app)/profile/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChampionshipSummary } from "@/lib/championship/types";
import type { Friend } from "@/lib/friendship/types";
import { regionLabel } from "@/lib/round/regions";

export type InviteFriendDialogProps = {
  friend: Friend;
  /** Campeonatos em que o usuário logado é dono — só esses podem receber convite. */
  ownedChampionships: ChampionshipSummary[];
};

/** Dialog com o `Select` dos campeonatos próprios para convidar um amigo. */
export function InviteFriendDialog({
  friend,
  ownedChampionships,
}: InviteFriendDialogProps) {
  const [open, setOpen] = useState(false);
  const [championshipId, setChampionshipId] = useState<string | undefined>(
    ownedChampionships[0]?.id,
  );

  const { execute, isExecuting } = useAction(inviteFriendToChampionship, {
    onSuccess: () => {
      toast.success("Convite enviado!");
      setOpen(false);
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? "Não foi possível enviar o convite.");
    },
  });

  function handleSubmit() {
    if (!championshipId) return;
    execute({ championshipId, friendUserId: friend.userId });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Convidar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar {friend.teamName}</DialogTitle>
          <DialogDescription>
            Escolha um campeonato seu para convidar {friend.userName}.
          </DialogDescription>
        </DialogHeader>

        {ownedChampionships.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Você ainda não criou nenhum campeonato.
          </p>
        ) : (
          <Select value={championshipId} onValueChange={setChampionshipId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Escolha um campeonato" />
            </SelectTrigger>
            <SelectContent>
              {ownedChampionships.map((championship) => (
                <SelectItem key={championship.id} value={championship.id}>
                  {championship.name} · {regionLabel(championship.region)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DialogFooter>
          <Button
            type="button"
            disabled={isExecuting || ownedChampionships.length === 0}
            onClick={handleSubmit}
          >
            {isExecuting ? "Convidando…" : "Convidar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
