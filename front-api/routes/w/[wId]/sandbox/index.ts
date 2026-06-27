import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { withComputerFeature } from "@front-api/middlewares/with_computer_feature";

import egressPolicy from "./egress-policy";
import envVars from "./env-vars";

// Mounted at /api/w/:wId/sandbox. The shared admin + feature-flag gates are
// applied here so every leaf below inherits them.
const app = workspaceApp();

app.use("*", ensureIsAdmin());
app.use("*", withComputerFeature());

app.route("/egress-policy", egressPolicy);
app.route("/env-vars", envVars);

export default app;
