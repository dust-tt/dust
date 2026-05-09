import { Hono } from "hono";

import { cors } from "./middleware/cors";
import { healthzApp } from "./routes/healthz";
import { workspaceApp } from "./routes/w";

// Single source of truth for which routes are served natively by Hono.
// Anything not listed here is delegated to the Next.js handler. OPTIONS is
// listed alongside GET/POST/etc. so CORS preflights for Hono-served routes
// are handled by the Hono CORS middleware rather than Next.js.
interface HonoRoute {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
  pattern: string;
}

const HONO_ROUTES: HonoRoute[] = [
  { method: "GET", pattern: "/api/healthz" },
  { method: "GET", pattern: "/api/w/:wId/spaces" },
  { method: "POST", pattern: "/api/w/:wId/spaces" },
  { method: "OPTIONS", pattern: "/api/w/:wId/spaces" },
];

const HONO_ROUTE_REGEXES = HONO_ROUTES.map((r) => ({
  method: r.method,
  regex: new RegExp(`^${r.pattern.replace(/:[^/]+/g, "[^/]+")}$`),
}));

const apiApp = new Hono();
apiApp.route("/healthz", healthzApp);
apiApp.route("/w/:wId", workspaceApp);

export const honoApp = new Hono();
honoApp.use("*", cors);
honoApp.route("/api", apiApp);

export function isHonoRoute(
  method: string | undefined,
  url: string | undefined
): boolean {
  if (!method || !url) {
    return false;
  }

  const queryStart = url.indexOf("?");
  const path = queryStart === -1 ? url : url.slice(0, queryStart);

  return HONO_ROUTE_REGEXES.some(
    (r) => r.method === method && r.regex.test(path)
  );
}
