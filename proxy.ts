import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

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

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/my-team/:path*",
    "/ranking/:path*",
    "/profile/:path*",
    "/home/:path*",
  ],
};
