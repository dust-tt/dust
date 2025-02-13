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

  if (process.env.NODE_ENV === "development") {
    if (request.method === "OPTIONS") {
      console.log("OPTIONS request");
      const response = new NextResponse(null, { status: 200 });

      response.headers.set(
        "Access-Control-Allow-Origin",
        "http://localhost:3010"
      );
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
      );
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Authorization, X-Request-Origin, x-Commit-Hash, X-Dust-Extension-Version, Content-Type"
      );
      response.headers.set("Access-Control-Allow-Credentials", "true");

      return response;
    }

    // For non-OPTIONS requests, add CORS headers but continue to auth middleware
    const response = NextResponse.next();
    response.headers.set(
      "Access-Control-Allow-Origin",
      "http://localhost:3010"
    );
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set(
      "Access-Control-Allow-Headers",
      // TODO: This should contain all the headers that are allowed in the request.
      "Authorization, X-Request-Origin, x-Commit-Hash, X-Dust-Extension-Version, Content-Type"
    );
    response.headers.set("Access-Control-Allow-Credentials", "true");

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
