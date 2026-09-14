import { Crosshair, Home, Trophy, User, type LucideIcon } from "lucide-react";

export type Section = { label: string; icon: LucideIcon; href: string };

/** As 4 seções do app logado — compartilhadas entre `AppHeader` (nav de
 * desktop) e `BottomNav` (`< md`), para as duas nunca divergirem. */
export const SECTIONS: Section[] = [
  { label: "Início", icon: Home, href: "/home" },
  { label: "Perfil", icon: User, href: "/profile" },
  { label: "Escalação", icon: Crosshair, href: "/my-team" },
  { label: "Ranking", icon: Trophy, href: "/ranking" },
];
