import { NextResponse, type NextRequest } from "next/server";

/**
 * Network-boundary check for the app area: requests without a session cookie
 * are sent to sign-in. Full session validation happens server-side in the
 * app layout (requireUser), so this only avoids rendering work for visitors.
 */
const SESSION_COOKIES = ["__Host-whyus_session", "whyus_session"];

export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (!hasSession) {
    const url = request.nextUrl.clone();
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/onboarding"],
};
