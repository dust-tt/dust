import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const url = request.nextUrl.pathname;

  // The CASA test attempts to at least double encode the string to bypass checks hence why we
  // attempt to handle nested encoding up to 8 times.
  let decodedUrl = url;
  let count = 0;
  let prevUrl;
  do {
    prevUrl = decodedUrl;
    decodedUrl = decodeURIComponent(prevUrl);
    count++;
  } while (decodedUrl !== prevUrl && count <= 8);

  // Check for various path traversal patterns
  const dangerous = [
    // Basic traversal
    "../",
    "..\\",
    // Percent encoding
    "..%2f",
    "..%5c",
    // Double encoding
    "..%252f",
    "..%255c",
    // Unicode encoding
    "..%u2216",
    // Overlong UTF-8 encoding
    "..%c0%af",
    "..%c1%9c",
    // Dot encoding
    "%2e%2e%2f",
    "%2e%2e/",
    // Null bytes
    "%00",
    "\x00",
    "\u0000",
    // Hex encoding
    "0x2e0x2e0x2f",
  ].some((pattern) => decodedUrl.toLowerCase().includes(pattern));

  if (dangerous) {
    return new NextResponse(null, {
      status: 400,
      statusText: "Bad Request",
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
