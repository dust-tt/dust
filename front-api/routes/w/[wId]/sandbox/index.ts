import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { withComputerFeature } from "@front-api/middlewares/with_computer_feature";

import egressPolicy from "./egress-policy";
import envVars from "./env-vars";
import functions from "./functions";

// Mounted at /api/w/:wId/sandbox. Function invocation endpoints are user-facing
// and authorize through SandboxFunctionResource + their own feature flag, while sandbox settings
// remain admin-only and gated behind the broader Computer feature.
const app = workspaceApp();

app.route("/functions", functions);

app.use("*", withComputerFeature());
app.use("*", ensureIsAdmin());

app.route("/egress-policy", egressPolicy);
app.route("/env-vars", envVars);

export default app;
