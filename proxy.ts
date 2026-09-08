import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

import {
  REGION_COOKIE,
  REGION_HEADER,
  REGION_PARAM,
} from "@/lib/team/region-constants";
import { parseTeamRegion } from "@/lib/round/regions";

// Toda rota logada (route group `app/(app)/`) precisa estar aqui.
const PROTECTED_PREFIXES = ["/my-team", "/ranking", "/profile", "/home"];

// Checagem otimista de UX via cookie — a checagem real de sessão acontece
// nos server components (`auth.api.getSession`).
//
// O caminho inverso (mandar quem já está logado de `/login` e `/signup` para
// `/home`) **não** mora aqui de propósito: `getSessionCookie` só olha se o
// cookie existe, não se a sessão ainda vale. Um cookie órfão (sessão expirada,
// banco recriado em dev) prendia o usuário fora do cadastro — `/signup` caía em
// `/home`, que na checagem real não achava sessão e devolvia para `/login`,
// que o proxy jogava de volta em `/home`. As duas páginas já fazem o
// redirect com `auth.api.getSession`, que é a checagem verdadeira.
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  if (
    !sessionCookie &&
    PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return applyRegionSelection(request);
}

/**
 * A troca de região (`.claude/plans/10-time-por-regiao.md`, decisão 8):
 * `?region=` na URL grava um cookie de longa duração **e** propaga a escolha
 * via header para esta mesma requisição.
 *
 * Por que os dois: `cookies()` num Server Component lê os cookies **de
 * entrada** da requisição — o `Set-Cookie` da resposta só vale a partir da
 * próxima navegação. Sem o header, `app/(app)/layout.tsx` (que não recebe
 * `searchParams`) mostraria o time da região anterior por uma navegação
 * inteira. `NextResponse.next({ request: { headers } })` é a forma
 * documentada de reescrever headers de request no meio da cadeia.
 *
 * Não valida no banco (o proxy não faz I/O) — quem clampa "international sem
 * torneio ativo" é `resolveRegion` (lib/team/region-selection.ts).
 */
function applyRegionSelection(request: NextRequest) {
  const requested = parseTeamRegion(
    request.nextUrl.searchParams.get(REGION_PARAM),
  );
  if (!requested) return NextResponse.next();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REGION_HEADER, requested);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(REGION_COOKIE, requested, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const config = {
  matcher: [
    "/my-team/:path*",
    "/ranking/:path*",
    "/profile/:path*",
    "/home/:path*",
  ],
};
