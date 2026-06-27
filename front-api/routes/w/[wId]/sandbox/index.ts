import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { withComputerFeature } from "@front-api/middlewares/with_computer_feature";

import egressPolicy from "./egress-policy";
import envVars from "./env-vars";

// Mounted at /api/w/:wId/sandbox. This subtree is admin-only and gated behind the broader
// Computer feature. User-facing Sandbox Function invocation endpoints live under
// /api/w/:wId/sandbox-functions.
const app = workspaceApp();

app.use("*", withComputerFeature());
app.use("*", ensureIsAdmin());

app.route("/egress-policy", egressPolicy);
app.route("/env-vars", envVars);

export default app;
