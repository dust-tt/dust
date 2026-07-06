import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { withSandboxFunctionsFeature } from "@front-api/middlewares/with_sandbox_functions_feature";

import egressPolicy from "./egress-policy";

// Mounted at /api/w/:wId/spaces/:spaceId/sandbox. The workspace-admin and
// `sandbox_functions` feature gates are applied here so every leaf below
// inherits them. Pod membership access is intentionally not used yet — the
// pod-level sandbox surface is workspace-admin only for now.
const app = workspaceApp();

app.use("*", ensureIsAdmin());
app.use("*", withSandboxFunctionsFeature());

app.route("/egress-policy", egressPolicy);

export default app;
