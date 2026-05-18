import type { MiddlewareHandler } from "hono";

import {
  ALLOWED_HEADERS,
  isAllowedHeader,
  isAllowedOrigin,
} from "@app/config/cors";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";

const ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const EXPOSE_HEADERS = "X-Reload-Required";

/**
 * Mirrors the CORS handling in `front/middleware.ts` (the Next.js Edge
 * middleware) for any request served natively by Hono. Without this, requests
 * routed to Hono before Next sees them lose the cross-origin headers that
 * Next middleware would otherwise add to every `/api/*` response.
 */
export const cors: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header("origin");

  // Not a CORS request (e.g. server-to-server). Let it through unchanged.
  if (!origin) {
    if (c.req.method === "OPTIONS") {
      return c.body(null, 200);
    }
    await next();
    return;
  }

  const dev = isDevelopment();

  if (!dev && !isAllowedOrigin(origin)) {
    logger.info({ origin }, "Forbidden: Unauthorized Origin");
    return c.body(null, 403, { "X-CORS-Reason": "origin" });
  }

  if (c.req.method === "OPTIONS") {
    const requested = c.req.header("access-control-request-headers");
    if (requested) {
      const hasUnallowedHeader = requested
        .toLowerCase()
        .split(",")
        .map((h) => h.trim())
        .some((h) => !isAllowedHeader(h));
      if (hasUnallowedHeader && !dev) {
        return c.body(null, 403, { "X-CORS-Reason": "headers" });
      }
    }

    return c.body(null, 200, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": ALLOW_METHODS,
      "Access-Control-Allow-Headers": ALLOWED_HEADERS.join(", "),
      "Access-Control-Expose-Headers": EXPOSE_HEADERS,
    });
  }

  await next();

  c.header("Access-Control-Allow-Origin", origin);
  c.header("Access-Control-Allow-Credentials", "true");
  c.header("Access-Control-Allow-Methods", ALLOW_METHODS);
  c.header("Access-Control-Allow-Headers", ALLOWED_HEADERS.join(", "));
  c.header("Access-Control-Expose-Headers", EXPOSE_HEADERS);
};
