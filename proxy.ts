import { NextResponse, type NextRequest } from "next/server";
import { UNAUTHORIZED_MESSAGE } from "@/lib/auth/require-session";
import { isValidSessionToken, SESSION_COOKIE } from "@/lib/auth/session";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const authenticated = await isValidSessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (PUBLIC_PATHS.has(pathname)) {
    if (authenticated && pathname === "/login") return redirectTo(request, "/");
    return NextResponse.next();
  }

  if (authenticated) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: UNAUTHORIZED_MESSAGE }, { status: 401 });
  }

  const next = pathname === "/" ? "" : `?next=${encodeURIComponent(`${pathname}${search}`)}`;
  return redirectTo(request, `/login${next}`);
}

// Proxy redirects must be absolute. Next builds request.url from the Host header and
// X-Forwarded-Proto, which Cloudflare Tunnel sets to the public host and https.
function redirectTo(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
