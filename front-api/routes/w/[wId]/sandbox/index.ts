import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureRole } from "@front-api/middlewares/ensure_role";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

import egressPolicy from "./egress-policy";
import envVars from "./env-vars";

// Mounted at /api/w/:wId/sandbox. The shared admin + feature-flag gates are
// applied here so every leaf below inherits them.
const app = workspaceApp();

app.use("*", ensureRole({ admin: true }));
app.use(
  "*",
  withFeatureFlag("sandbox_tools", {
    message: "Sandbox tools are not enabled for this workspace.",
  })
);
app.use(
  "*",
  withFeatureFlag("sandbox_workspace_admin", {
    message:
      "Sandbox workspace admin configuration is not enabled for this workspace.",
  })
);

app.route("/egress-policy", egressPolicy);
app.route("/env-vars", envVars);

export default app;
