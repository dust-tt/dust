import {
  ALLOWED_HEADERS,
  isAllowedHeader,
  isAllowedOrigin,
} from "@app/config/cors";
import logger from "@app/logger/logger";
import {
  DUST_FILE_CONTENT_TYPE_HEADER,
  DUST_FILE_ID_HEADER,
} from "@app/types/files";
import { isDevelopment } from "@app/types/shared/env";
import type { MiddlewareHandler } from "hono";

const ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const EXPOSE_HEADERS = [
  "X-Reload-Required",
  "WWW-Authenticate",
  "mcp-session-id",
  "mcp-protocol-version",
  DUST_FILE_CONTENT_TYPE_HEADER,
  DUST_FILE_ID_HEADER,
].join(", ");

// The MCP server endpoint authenticates strictly through a Bearer JWT in the
// Authorization header — it never reads cookies or any other ambient
// credential. Origin allowlisting therefore protects nothing here (the JWT is
// the security boundary) while blocking legitimate third-party MCP clients
// (browser extensions, other apps) that register dynamically via DCR. Serve it
// as a public, credential-less CORS endpoint: any origin, and crucially no
// Access-Control-Allow-Credentials (which browsers forbid alongside a wildcard
// origin anyway, and which is unnecessary since the token is an explicit
// header, not sent via credentials mode).
function isPublicMcpPath(path: string): boolean {
  return path === "/mcp" || path.startsWith("/mcp/");
}

/**
 * Adds the cross-origin headers expected by browser clients to every
 * Hono-served response. Applied globally so `/api/*` and `/sse/*` requests
 * succeed for the SDK, extensions, and the SPA.
 */
export const cors: MiddlewareHandler = async (ctx, next) => {
  const origin = ctx.req.header("origin");

  // Not a CORS request (e.g. server-to-server). Let it through unchanged.
  if (!origin) {
    if (ctx.req.method === "OPTIONS") {
      return ctx.body(null, 200);
    }
    await next();
    return;
  }

  // Public, credential-less CORS for the MCP server endpoint (see above).
  if (isPublicMcpPath(ctx.req.path)) {
    if (ctx.req.method === "OPTIONS") {
      const requested = ctx.req.header("access-control-request-headers");
      return ctx.body(null, 200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": ALLOW_METHODS,
        "Access-Control-Allow-Headers": requested ?? ALLOWED_HEADERS.join(", "),
        "Access-Control-Expose-Headers": EXPOSE_HEADERS,
      });
    }

    await next();

    ctx.header("Access-Control-Allow-Origin", "*");
    ctx.header("Access-Control-Allow-Methods", ALLOW_METHODS);
    ctx.header("Access-Control-Allow-Headers", ALLOWED_HEADERS.join(", "));
    ctx.header("Access-Control-Expose-Headers", EXPOSE_HEADERS);
    return;
  }

  const dev = isDevelopment();

  if (!dev && !isAllowedOrigin(origin)) {
    logger.info({ origin }, "Forbidden: Unauthorized Origin");
    return ctx.body(null, 403, { "X-CORS-Reason": "origin" });
  }

  if (ctx.req.method === "OPTIONS") {
    const requested = ctx.req.header("access-control-request-headers");
    if (requested) {
      const hasUnallowedHeader = requested
        .toLowerCase()
        .split(",")
        .map((h) => h.trim())
        .some((h) => !isAllowedHeader(h));
      if (hasUnallowedHeader && !dev) {
        return ctx.body(null, 403, { "X-CORS-Reason": "headers" });
      }
    }

    return ctx.body(null, 200, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": ALLOW_METHODS,
      "Access-Control-Allow-Headers": ALLOWED_HEADERS.join(", "),
      "Access-Control-Expose-Headers": EXPOSE_HEADERS,
    });
  }

  await next();

  ctx.header("Access-Control-Allow-Origin", origin);
  ctx.header("Access-Control-Allow-Credentials", "true");
  ctx.header("Access-Control-Allow-Methods", ALLOW_METHODS);
  ctx.header("Access-Control-Allow-Headers", ALLOWED_HEADERS.join(", "));
  ctx.header("Access-Control-Expose-Headers", EXPOSE_HEADERS);
};
