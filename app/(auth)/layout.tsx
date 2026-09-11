import type { ReactNode } from "react";

// Sem wrapper de centralização: `AuthShell` (components/auth/auth-shell.tsx)
// já monta o grid de duas colunas em tela cheia para cada página deste grupo.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
