import { Hono } from "hono";

import { cors } from "./middleware/cors";
import { sessionAuth } from "./middleware/session_auth";
import { userAuth } from "./middleware/user_auth";
import { appStatusApp } from "./routes/app-status";
import { authContextApp } from "./routes/auth-context";
import { createNewWorkspaceApp } from "./routes/create-new-workspace";
import { healthzApp } from "./routes/healthz";
import { invitationsApp } from "./routes/invitations";
import { killApp } from "./routes/kill";
import { publicWorkspaceApp } from "./routes/v1/w";
import { workspaceApp } from "./routes/w";
import { workspaceLookupApp } from "./routes/workspace-lookup";

// Single source of truth for which routes are served natively by Hono.
// Anything not listed here is delegated to the Next.js handler. OPTIONS is
// auto-added for every pattern with any other method so CORS preflights for
// Hono-served routes are handled by the Hono CORS middleware rather than
// Next.js.
type HonoMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";

interface HonoRoute {
  pattern: string;
  methods: HonoMethod[];
}

const HONO_ROUTES: HonoRoute[] = [
  { pattern: "/api/healthz", methods: ["GET"] },
  { pattern: "/api/app-status", methods: ["GET"] },
  { pattern: "/api/auth-context", methods: ["GET"] },
  { pattern: "/api/create-new-workspace", methods: ["POST"] },
  { pattern: "/api/invitations", methods: ["GET"] },
  { pattern: "/api/kill", methods: ["GET"] },
  { pattern: "/api/workspace-lookup", methods: ["GET"] },
  { pattern: "/api/w/:wId/spaces", methods: ["GET", "POST"] },
  { pattern: "/api/w/:wId/spaces/:spaceId/mcp/available", methods: ["GET"] },
  { pattern: "/api/v1/w/:wId/spaces", methods: ["GET"] },
];

const HONO_ROUTE_REGEXES = HONO_ROUTES.map((r) => {
  const methods = new Set<HonoMethod>(r.methods);
  methods.add("OPTIONS");
  return {
    methods,
    regex: new RegExp(`^${r.pattern.replace(/:[^/]+/g, "[^/]+")}$`),
  };
});

// userAuth depends on c.get("session"), so sessionAuth must register first.
const sessionRoutes = new Hono();
sessionRoutes.use("*", sessionAuth);
sessionRoutes.use("*", userAuth);
sessionRoutes.route("/auth-context", authContextApp);
sessionRoutes.route("/create-new-workspace", createNewWorkspaceApp);
sessionRoutes.route("/invitations", invitationsApp);
sessionRoutes.route("/workspace-lookup", workspaceLookupApp);

const apiApp = new Hono();
apiApp.route("/healthz", healthzApp);
apiApp.route("/app-status", appStatusApp);
apiApp.route("/kill", killApp);
apiApp.route("/", sessionRoutes);
apiApp.route("/w/:wId", workspaceApp);
apiApp.route("/v1/w/:wId", publicWorkspaceApp);

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
    (r) => r.methods.has(method as HonoMethod) && r.regex.test(path)
  );
}
