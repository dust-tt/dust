import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";

import egressPolicy from "./egress-policy";
import envVars from "./env-vars";

// Mounted at /api/w/:wId/sandbox. The shared admin gate is applied here so
// every leaf below inherits it.
const app = workspaceApp();

app.use("*", ensureIsAdmin());

app.route("/egress-policy", egressPolicy);
app.route("/env-vars", envVars);

export default app;
