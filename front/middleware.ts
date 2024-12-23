import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  // Detect path traversal attempts
  const url = request.nextUrl.pathname;
  if (url.includes("../") || url.includes("..%2F") || url.includes("..%5C")) {
    return new NextResponse(null, { status: 400 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
