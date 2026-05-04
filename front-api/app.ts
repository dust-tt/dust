import { Hono } from "hono";

import { healthApp } from "./routes/health";

// Single source of truth for which routes are served natively by Hono.
// Anything not listed here is delegated to the Next.js handler.
interface HonoRoute {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  pattern: string;
}

const HONO_ROUTES: HonoRoute[] = [{ method: "GET", pattern: "/api/healthz" }];

export const honoApp = new Hono();

honoApp.route("/", healthApp);

export function isHonoRoute(
  method: string | undefined,
  url: string | undefined
): boolean {
  if (!method || !url) {
    return false;
  }

  const queryStart = url.indexOf("?");
  const path = queryStart === -1 ? url : url.slice(0, queryStart);

  return HONO_ROUTES.some((r) => r.method === method && r.pattern === path);
}
