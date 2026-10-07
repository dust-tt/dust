import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasWorkspacePermission } from "@front-api/middlewares/ensure_role";
import egressPolicy from "./egress-policy";
import envVars from "./env-vars";

// Mounted at /api/w/:wId/sandbox. The shared admin gate is applied here so
// every leaf below inherits it. The Computer feature flag gates the UI only
// (SandboxPage), not the routes.
const app = workspaceApp();

app.use(
  "*",
  ensureHasWorkspacePermission(
    "admin",
    "security",
    "You are not authorized to manage the sandbox."
  )
);

app.route("/egress-policy", egressPolicy);
app.route("/env-vars", envVars);

export default app;
