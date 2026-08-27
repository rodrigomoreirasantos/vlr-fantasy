import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Toda rota logada (route group `app/(app)/`) precisa estar aqui.
const PROTECTED_PREFIXES = ["/my-team", "/ranking"];

// Checagem otimista de UX via cookie — a checagem real de sessão acontece
// nos server components (`auth.api.getSession`).
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  if (
    !sessionCookie &&
    PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (sessionCookie && ["/login", "/signup"].includes(pathname)) {
    return NextResponse.redirect(new URL("/my-team", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/my-team/:path*", "/ranking/:path*", "/login", "/signup"],
};
