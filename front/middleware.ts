// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import {
  ALLOWED_HEADERS,
  isAllowedHeader,
  isAllowedOrigin,
} from "@app/config/cors";
import { getSseRedirectPathname } from "@app/lib/api/sse_redirect";
import logger from "@app/logger/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  // Block TRACE requests
  if (request.method === "TRACE") {
    return new NextResponse(null, { status: 405 });
  }

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

  // Handle CORS for API endpoints.
  const needsCors = url.startsWith("/api/");

  if (needsCors) {
    if (request.method === "OPTIONS") {
      // Handle preflight request.
      const response = new NextResponse(null, { status: 200 });
      return handleCors(response, request);
    }

    // SSE routing: redirect old SSE event paths to /api/sse/ prefix so the ingress can route them
    // to dedicated front-sse pods. This lives in middleware (not next.config.js redirects)
    // because next.config.js redirects run before middleware and therefore lack CORS headers, which
    // breaks cross-origin clients (Chrome extension, SDK).
    const sseRedirectPathname = getSseRedirectPathname(url);
    if (sseRedirectPathname) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = sseRedirectPathname;
      const response = NextResponse.redirect(redirectUrl, 307);
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

  // Cannot use helper functions like isDevelopment() in Edge Runtime middleware since they are not
  // bundled. Must check NODE_ENV directly.
  const isDevelopment = process.env.NODE_ENV === "development";

  // If this is a preflight request checking headers.
  if (request.method === "OPTIONS" && requestHeaders) {
    const requestedHeaders = requestHeaders.split(",").map((h) => h.trim());
    const hasUnallowedHeader = requestedHeaders.some(
      (header) => !isAllowedHeader(header)
    );

    if (hasUnallowedHeader && !isDevelopment) {
      return new NextResponse(null, {
        status: 403,
        statusText: "Forbidden: Unauthorized Headers",
      });
    }
  }

  // Check if origin is allowed (prod or dev).
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
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    ALLOWED_HEADERS.join(", ")
  );
  response.headers.set("Access-Control-Expose-Headers", "X-Reload-Required");

  return undefined;
}

export const config = {
  matcher: "/:path*",
};
