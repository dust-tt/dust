import {
  ALLOWED_HEADERS,
  isAllowedHeader,
  isAllowedOrigin,
} from "@app/config/cors";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import type { MiddlewareHandler } from "hono";

const ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const EXPOSE_HEADERS = "X-Reload-Required";

/**
 * Mirrors the CORS handling in `front/middleware.ts` (the Next.js Edge
 * middleware) for any request served natively by Hono. Without this, requests
 * routed to Hono before Next sees them lose the cross-origin headers that
 * Next middleware would otherwise add to every `/api/*` response.
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
