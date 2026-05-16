import { Hono } from "hono";
import { RegExpRouter } from "hono/router/reg-exp-router";
import { SmartRouter } from "hono/router/smart-router";
import { TrieRouter } from "hono/router/trie-router";

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

// Dispatch index for isHonoRoute(). Built from honoApp's flattened route
// table — registering a Hono route is the single source of truth for whether
// a request goes to Hono vs Next. Filters out middleware (method "ALL"), so
// only concrete handlers count.
//
// SmartRouter tries RegExpRouter first (O(1) via a single compiled regex)
// and falls back to TrieRouter for path combinations RegExp can't handle
// (e.g., two routes diverging at the same depth with different param names).
const dispatchRouter = new SmartRouter<true>({
  routers: [new RegExpRouter<true>(), new TrieRouter<true>()],
});
for (const route of honoApp.routes) {
  if (route.method === "ALL") continue;
  dispatchRouter.add(route.method, route.path, true);
}

const PREFLIGHT_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export function isHonoRoute(
  method: string | undefined,
  url: string | undefined
): boolean {
  if (!method || !url) {
    return false;
  }

  const queryStart = url.indexOf("?");
  const path = queryStart === -1 ? url : url.slice(0, queryStart);

  if (dispatchRouter.match(method, path)[0].length > 0) {
    return true;
  }

  // CORS preflight: route OPTIONS to Hono whenever any non-OPTIONS method is
  // registered for the path, so the cors middleware can short-circuit.
  if (method === "OPTIONS") {
    for (const m of PREFLIGHT_METHODS) {
      if (dispatchRouter.match(m, path)[0].length > 0) {
        return true;
      }
    }
  }
  return false;
}
