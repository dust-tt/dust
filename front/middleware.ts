import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  // Redirect for components files under site/
  if (req.nextUrl.pathname.startsWith("/site/components")) {
    return NextResponse.rewrite(new URL("/404", req.nextUrl));
  }

  return NextResponse.next();
}
