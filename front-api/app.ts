import { Hono } from "hono";
import { RegExpRouter } from "hono/router/reg-exp-router";
import { SmartRouter } from "hono/router/smart-router";
import { TrieRouter } from "hono/router/trie-router";

import { cors } from "./middleware/cors";
import preStopApp from "./routes/[preStopSecret]";
import { appStatusApp } from "./routes/app-status";
import { loginApp } from "./routes/auth/login";
import { authContextApp } from "./routes/auth-context";
import { createNewWorkspaceApp } from "./routes/create-new-workspace";
import debugApp from "./routes/debug";
import docApp from "./routes/doc";
import emailApp from "./routes/email";
import enrichmentApp from "./routes/enrichment";
import geo from "./routes/geo";
import { healthzApp } from "./routes/healthz";
import { invitationsApp } from "./routes/invitations";
import { killApp } from "./routes/kill";
import privateLoginApp from "./routes/login";
import lookupApp from "./routes/lookup";
import metronomeApp from "./routes/metronome";
import oauthApp from "./routes/oauth";
import pokeApp from "./routes/poke";
import shareApp from "./routes/share";
import stripeApp from "./routes/stripe";
import templatesApp from "./routes/templates";
import userApp from "./routes/user";
import publicWorkspaceApp from "./routes/v1/w/[wId]";
import workspaceApp from "./routes/w/[wId]";
import workosApp from "./routes/workos";
import { workspaceLookupApp } from "./routes/workspace-lookup";

const apiApp = new Hono();
apiApp.route("/healthz", healthzApp);
apiApp.route("/app-status", appStatusApp);
apiApp.route("/auth/login", loginApp);
apiApp.route("/auth-context", authContextApp);
apiApp.route("/create-new-workspace", createNewWorkspaceApp);
apiApp.route("/debug", debugApp);
apiApp.route("/doc", docApp);
apiApp.route("/email", emailApp);
apiApp.route("/enrichment", enrichmentApp);
apiApp.route("/geo", geo);
apiApp.route("/invitations", invitationsApp);
apiApp.route("/kill", killApp);
apiApp.route("/login", privateLoginApp);
apiApp.route("/lookup", lookupApp);
apiApp.route("/metronome", metronomeApp);
apiApp.route("/oauth", oauthApp);
apiApp.route("/poke", pokeApp);
apiApp.route("/share", shareApp);
apiApp.route("/stripe", stripeApp);
apiApp.route("/templates", templatesApp);
apiApp.route("/user", userApp);
apiApp.route("/workos", workosApp);
apiApp.route("/workspace-lookup", workspaceLookupApp);
apiApp.route("/w/:wId", workspaceApp);
apiApp.route("/v1/w/:wId", publicWorkspaceApp);
// Pre-stop uses a dynamic first segment (the secret) — register last so its
// `/:preStopSecret/prestop` shape doesn't shadow any literal-prefixed routes
// above.
apiApp.route("/:preStopSecret", preStopApp);

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
  if (route.method === "ALL") {
    continue;
  }
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

  const path = new URL(url, "http://localhost").pathname;

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
