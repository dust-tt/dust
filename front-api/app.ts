import { Hono } from "hono";

import { cors } from "./middlewares/cors";
import { requestLogger } from "./middlewares/request_logger";
import { unhandledErrorHandler } from "./middlewares/utils";
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
import novuApp from "./routes/novu";
import oauthApp from "./routes/oauth";
import pokeApp from "./routes/poke";
import shareApp from "./routes/share";
import stripeApp from "./routes/stripe";
import tApp from "./routes/t";
import templatesApp from "./routes/templates";
import userApp from "./routes/user";
import publicWorkspaceApp from "./routes/v1/w/[wId]";
import publicWorkspaceTriggersApp from "./routes/v1/w/[wId]/triggers";
import workspaceApp from "./routes/w/[wId]";
import workspaceJoinApp from "./routes/w/[wId]/join";
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
apiApp.route("/novu", novuApp);
apiApp.route("/oauth", oauthApp);
apiApp.route("/poke", pokeApp);
apiApp.route("/share", shareApp);
apiApp.route("/stripe", stripeApp);
apiApp.route("/templates", templatesApp);
apiApp.route("/t", tApp);
apiApp.route("/user", userApp);
apiApp.route("/workos", workosApp);
apiApp.route("/workspace-lookup", workspaceLookupApp);
// join is mounted before the workspace app so it does not inherit workspaceAuth
// (it is a public, unauthenticated endpoint).
apiApp.route("/w/:wId/join", workspaceJoinApp);
apiApp.route("/w/:wId", workspaceApp);
// Triggers is mounted before the workspace app so it does not inherit
// publicApiAuth (it uses its own URL secret-based authentication).
apiApp.route("/v1/w/:wId/triggers", publicWorkspaceTriggersApp);
apiApp.route("/v1/w/:wId", publicWorkspaceApp);
// Pre-stop uses a dynamic first segment (the secret) — register last so its
// `/:preStopSecret/prestop` shape doesn't shadow any literal-prefixed routes
// above.
apiApp.route("/:preStopSecret", preStopApp);

export const honoApp = new Hono();
honoApp.use("*", requestLogger);
honoApp.use("*", cors);
honoApp.route("/api", apiApp);
honoApp.onError(unhandledErrorHandler);
