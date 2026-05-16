import { Hono } from "hono";

import { cors } from "./middleware/cors";
import { appStatusApp } from "./routes/app-status";
import { loginApp } from "./routes/auth/login";
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

// This is only needed during migration, to implement isHonoRoute()
const HONO_ROUTES: HonoRoute[] = [
  { pattern: "/api/healthz", methods: ["GET"] },
  { pattern: "/api/app-status", methods: ["GET"] },
  { pattern: "/api/auth/login", methods: ["GET"] },
  { pattern: "/api/auth-context", methods: ["GET"] },
  { pattern: "/api/create-new-workspace", methods: ["POST"] },
  { pattern: "/api/invitations", methods: ["GET"] },
  { pattern: "/api/kill", methods: ["GET"] },
  { pattern: "/api/workspace-lookup", methods: ["GET"] },
  {
    pattern: "/api/w/:wId/assistant/builder/process/generate_schema",
    methods: ["POST"],
  },
  {
    pattern: "/api/w/:wId/assistant/builder/sidekick/prompt/existing",
    methods: ["GET"],
  },
  {
    pattern: "/api/w/:wId/assistant/builder/sidekick/prompt/shrink-wrap",
    methods: ["GET"],
  },
  {
    pattern: "/api/w/:wId/assistant/builder/sidekick/prompt/template",
    methods: ["GET"],
  },
  {
    pattern: "/api/w/:wId/assistant/builder/slack/channels_linked_with_agent",
    methods: ["GET"],
  },
  { pattern: "/api/w/:wId/assistant/builder/suggestions", methods: ["POST"] },
  { pattern: "/api/w/:wId/assistant/mentions/parse", methods: ["POST"] },
  { pattern: "/api/w/:wId/assistant/mentions/suggestions", methods: ["GET"] },
  {
    pattern: "/api/w/:wId/assistant/skills/:sId/suggestions",
    methods: ["GET", "PATCH"],
  },
  {
    pattern: "/api/w/:wId/builder/assistants/:aId/actions",
    methods: ["GET"],
  },
  { pattern: "/api/w/:wId/builder/skills/suggestions", methods: ["POST"] },
  { pattern: "/api/w/:wId/feature-flags", methods: ["GET"] },
  { pattern: "/api/w/:wId/members/lookup", methods: ["GET"] },
  { pattern: "/api/w/:wId/members/search", methods: ["GET"] },
  { pattern: "/api/w/:wId/models", methods: ["GET"] },
  { pattern: "/api/w/:wId/providers", methods: ["GET"] },
  { pattern: "/api/w/:wId/provisioning-status", methods: ["GET"] },
  { pattern: "/api/w/:wId/spaces", methods: ["GET", "POST"] },
  { pattern: "/api/w/:wId/spaces/:spaceId/mcp/available", methods: ["GET"] },
  { pattern: "/api/w/:wId/trial-message-usage", methods: ["GET"] },
  { pattern: "/api/w/:wId/verified-domains", methods: ["GET"] },
  { pattern: "/api/w/:wId/verify", methods: ["GET"] },
  { pattern: "/api/w/:wId/welcome", methods: ["GET"] },
  { pattern: "/api/v1/w/:wId/feature_flags", methods: ["GET"] },
  { pattern: "/api/v1/w/:wId/spaces", methods: ["GET"] },
  { pattern: "/api/v1/w/:wId/verified_domains", methods: ["GET"] },
];

const HONO_ROUTE_REGEXES = HONO_ROUTES.map((r) => {
  const methods = new Set<HonoMethod>(r.methods);
  methods.add("OPTIONS");
  return {
    methods,
    regex: new RegExp(`^${r.pattern.replace(/:[^/]+/g, "[^/]+")}$`),
  };
});

const apiApp = new Hono();
apiApp.route("/healthz", healthzApp);
apiApp.route("/app-status", appStatusApp);
apiApp.route("/auth/login", loginApp);
apiApp.route("/auth-context", authContextApp);
apiApp.route("/create-new-workspace", createNewWorkspaceApp);
apiApp.route("/invitations", invitationsApp);
apiApp.route("/kill", killApp);
apiApp.route("/workspace-lookup", workspaceLookupApp);
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
