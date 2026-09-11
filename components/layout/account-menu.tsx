"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";

export type AccountMenuProps = {
  /** `user.name` — o nome de exibição, editável em `/profile`. */
  displayName: string;
  /**
   * `user.username` — o `@login` imutável (plano 06). É `null` no tipo por
   * causa do `customSyntheticUser` (`lib/auth.ts:56-65`); na prática todo
   * usuário real recebe um em `user.create.after`.
   */
  username: string | null;
};

/**
 * A identidade da **pessoa** no header — distinta do brasão + nome do **time**,
 * que ficam à esquerda. O logout mora aqui dentro de propósito: é a única ação
 * destrutiva do header e não deveria estar a um clique de distância
 * (`.claude/plans/21-header-conta-e-sair.md`).
 */
export function AccountMenu({ displayName, username }: AccountMenuProps) {
  const router = useRouter();
  const [isLeaving, setIsLeaving] = useState(false);

  const handle = username ? `@${username}` : displayName;
  const initial = (username ?? displayName).charAt(0).toUpperCase();

  async function signOutAndLeave() {
    if (isLeaving) return;
    setIsLeaving(true);
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`Abrir menu da conta (${handle})`}
          className="gap-2 pl-1"
        >
          <span
            aria-hidden
            className="clip-corner flex size-6 items-center justify-center bg-primary/15 text-[11px] font-bold text-primary [--clip:5px]"
          >
            {initial}
          </span>
          {/* Em tela estreita sobra só o monograma — nick de 20 caracteres
              empurraria a nav para outra linha (suposição 10). */}
          <span className="hidden text-[13px] font-semibold sm:inline">
            {handle}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="text-sm font-semibold text-foreground">
            {displayName}
          </span>
          {username && (
            <span className="text-xs text-muted-foreground">@{username}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          aria-disabled={isLeaving}
          className="cursor-pointer"
          onSelect={(event) => {
            // Segura o menu aberto: sem isto o item some antes do "Saindo…"
            // aparecer, e um segundo clique dispararia outro signOut.
            event.preventDefault();
            void signOutAndLeave();
          }}
        >
          <LogOut aria-hidden />
          {isLeaving ? "Saindo…" : "Sair"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
