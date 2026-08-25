import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Checagem otimista de UX via cookie — a checagem real de sessão acontece
// nos server components (`auth.api.getSession`).
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  if (!sessionCookie && pathname.startsWith("/my-team")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (sessionCookie && ["/login", "/signup"].includes(pathname)) {
    return NextResponse.redirect(new URL("/my-team", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/my-team/:path*", "/login", "/signup"],
};
