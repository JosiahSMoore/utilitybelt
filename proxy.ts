import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, isValidAuthToken, safeNextPath } from "@/lib/site-auth";

// Gates the entire site behind one shared password (see lib/site-auth.ts).
// /login, /api/login, and /api/ingredients-feed are the only paths that
// must stay reachable without a valid cookie — the first two because
// there's no cookie yet to check, the feed because it's meant to be
// fetched by the recipe-import Claude Skill, which can't click through a
// password form (it has its own, separate token check — see that route).
// Everything else, including /list and Server Function POSTs (which
// Next.js routes to the page they were called from, not a separate path),
// gets redirected to the login form.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname === "/api/login" || pathname === "/api/ingredients-feed") {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (isValidAuthToken(token)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", safeNextPath(pathname));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
