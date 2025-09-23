import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  ALLOWED_HEADERS,
  isAllowedHeader,
  isAllowedOrigin,
} from "@app/config/cors";
import logger from "@app/logger/logger";

export function middleware(request: NextRequest) {
  // Block TRACE requests
  if (request.method === "TRACE") {
    return new NextResponse(null, { status: 405 });
  }

  const url = request.nextUrl.pathname;

  // Redirect assistant URLs to agent URLs (but not API routes)
  if (url.includes('/assistant/') && !url.startsWith('/api/')) {
    const newUrl = url.replace('/assistant/', '/agent/');
    return NextResponse.redirect(new URL(newUrl, request.url));
  }

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

  // Handle CORS only for public API endpoints.
  if (url.startsWith("/api/v1")) {
    if (request.method === "OPTIONS") {
      // Handle preflight request.
      const response = new NextResponse(null, { status: 200 });
      return handleCors(response, request);
    }

    // Handle actual request.
    const response = NextResponse.next();
    return handleCors(response, request);
  }

  return NextResponse.next();
}

function handleCors(
  response: NextResponse,
  request: NextRequest
): NextResponse {
  const corsResponseError = setCorsHeaders(response, request);
  if (corsResponseError) {
    // If setCorsHeaders returned a response, it's an error.
    return corsResponseError;
  }

  return response;
}

function setCorsHeaders(
  response: NextResponse,
  request: NextRequest
): NextResponse | undefined {
  const origin = request.headers.get("origin");
  const requestHeaders = request.headers
    .get("access-control-request-headers")
    ?.toLowerCase();

  // If there's no origin, it's not a CORS request (e.g. direct API call from backend) so we should
  // let it through without CORS headers
  if (!origin) {
    return undefined;
  }

  // If this is a preflight request checking headers.
  if (request.method === "OPTIONS" && requestHeaders) {
    const requestedHeaders = requestHeaders.split(",").map((h) => h.trim());
    const hasUnallowedHeader = requestedHeaders.some(
      (header) => !isAllowedHeader(header)
    );

    if (hasUnallowedHeader) {
      return new NextResponse(null, {
        status: 403,
        statusText: "Forbidden: Unauthorized Headers",
      });
    }
  }

  // Check if origin is allowed (prod or dev).

  // Cannot use helper functions like isDevelopment() in Edge Runtime middleware since they are not
  // bundled. Must check NODE_ENV directly.
  const isDevelopment = process.env.NODE_ENV === "development";
  if (isDevelopment || isAllowedOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  } else {
    logger.info({ origin }, "Forbidden: Unauthorized Origin");

    return new NextResponse(null, {
      status: 403,
      statusText: "Forbidden: Unauthorized Origin",
    });
  }

  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    ALLOWED_HEADERS.join(", ")
  );

  return undefined;
}

export const config = {
  matcher: "/:path*",
};
