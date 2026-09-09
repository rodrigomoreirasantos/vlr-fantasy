"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export type LiveRefreshProps = {
  /** Intervalo entre atualizações, em ms — `refreshIntervalMs` decide qual. */
  intervalMs: number;
};

/**
 * Mantém a Home viva sem F5: recarrega os dados do servidor de tempos em
 * tempos, enquanto a aba estiver à vista.
 *
 * `router.refresh()` refaz só os Server Components e funde o resultado — o
 * campeonato escolhido no filtro de "Próximos jogos", a rolagem e qualquer
 * outro estado de cliente continuam de pé. É a diferença entre atualizar a
 * página e recarregá-la.
 *
 * Aba escondida não atualiza nada: ninguém está lendo, e cada ciclo é uma
 * rodada de consultas ao banco por usuário conectado. Ao voltar, atualiza na
 * hora — quem estava fora perdeu justamente o que aconteceu enquanto isso.
 */
export function LiveRefresh({ intervalMs }: LiveRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    function stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    }

    function start() {
      if (timer !== null) return;
      timer = setInterval(() => router.refresh(), intervalMs);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        router.refresh();
        start();
      } else {
        stop();
      }
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router, intervalMs]);

  return null;
}
