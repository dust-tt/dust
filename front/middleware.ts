import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const url = request.nextUrl.pathname;

  // We test decodedURL as attackers could hide the traversal patterns behind encodings. Ideally we
  // should as well check nested encodings but will start with this.
  const decodedUrl = decodeURIComponent(url);

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
