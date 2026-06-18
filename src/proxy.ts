import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const DRIVER_HOSTS = new Set(["driver.travelyt.us", "drivers.travelyt.us"]);
const ADMIN_HOSTS = new Set(["admin.travelyt.us"]);
const SHARED_PATHS = [
  "/privacy",
  "/prohibited-items",
  "/support",
  "/terms",
];

function normalizedHost(request: NextRequest) {
  return request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
}

function isSharedPath(pathname: string) {
  return SHARED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

function rewriteToSurface(request: NextRequest, surfacePath: "/admin" | "/driver") {
  const { pathname } = request.nextUrl;
  if (pathname === surfacePath || pathname.startsWith(`${surfacePath}/`)) {
    return NextResponse.next();
  }
  if (surfacePath === "/driver" && isSharedPath(pathname)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? surfacePath : `${surfacePath}${pathname}`;
  return NextResponse.rewrite(url);
}

export function proxy(request: NextRequest) {
  const host = normalizedHost(request);
  if (DRIVER_HOSTS.has(host)) return rewriteToSurface(request, "/driver");
  if (ADMIN_HOSTS.has(host)) return rewriteToSurface(request, "/admin");
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
