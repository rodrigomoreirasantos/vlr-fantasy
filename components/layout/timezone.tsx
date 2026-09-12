"use client";

import { createContext, useContext, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  DISPLAY_FALLBACK_TZ,
  guessBrowserTimezone,
  TZ_COOKIE,
} from "@/lib/round/timezone";

/**
 * O fuso em que a árvore inteira escreve horas — semeado pelo servidor
 * (`resolveTimezone`, `lib/round/timezone-selection.ts`) e publicado aqui uma
 * vez por render do layout.
 *
 * Diferente de `RegionDisplayProvider` (`components/layout/region-display.tsx`):
 * o fuso não muda dentro de uma renderização (não há `?tz=` nem ação que o
 * altere), então não precisa de `useState` nem de um `Sync` por página — quem
 * o atualiza é sempre o servidor, no próximo `router.refresh()`.
 */
const TimezoneContext = createContext<string>(DISPLAY_FALLBACK_TZ);

export function TimezoneProvider({
  tz,
  children,
}: {
  tz: string;
  children: React.ReactNode;
}) {
  return (
    <TimezoneContext.Provider value={tz}>{children}</TimezoneContext.Provider>
  );
}

/**
 * O fuso de exibição agora. **Não lança** fora do provider — diferente de
 * `useRegionDisplay`: um fuso ausente mostra a hora de Brasília (o
 * comportamento de hoje, cosmético), enquanto uma região errada mostraria o
 * time errado (dado). Efeito colateral bom: nenhum teste de componente
 * existente precisa ganhar um provider só para continuar passando.
 */
export function useTimezone(): string {
  return useContext(TimezoneContext);
}

/**
 * Compara o fuso do servidor com o do navegador e, se divergirem, escreve o
 * cookie e pede ao Next para refazer a renderização — sem isso, o app fica
 * preso no chute do header `x-vercel-ip-timezone` (ou no fallback, em dev),
 * que erra sempre que a pessoa usa VPN ou o IP não bate com o fuso real.
 *
 * Não renderiza nada — existe só para carregar o efeito, no molde de
 * `RegionDisplaySync`.
 */
export function TimezoneSync({ serverTz }: { serverTz: string }) {
  const router = useRouter();

  useEffect(() => {
    const browserTz = guessBrowserTimezone();
    // Inválido (ou sem Intl): não escreve nada e não atualiza. Sem essa
    // guarda, um fuso que `parseTimezone` recusa no servidor deixaria a
    // condição abaixo sempre verdadeira — um laço infinito de refresh.
    if (!browserTz || browserTz === serverTz) return;

    // Não é `httpOnly`: quem escreve é o navegador, e não há nada sensível
    // aqui — diferente de `REGION_COOKIE`, escrito pelo proxy.
    document.cookie = `${TZ_COOKIE}=${browserTz}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }, [router, serverTz]);

  return null;
}
