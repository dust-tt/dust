import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { withSandboxFunctionsFeature } from "@front-api/middlewares/with_sandbox_functions_feature";

import egressPolicy from "./egress-policy";

// Mounted at /api/w/:wId/spaces/:spaceId/sandbox. The workspace-admin and
// `sandbox_functions` feature gates are applied here so every leaf below
// inherits them.
//
// Access-control decision (v0, deliberate): workspace-admin only, with pod
// membership intentionally not consulted. This means a workspace admin who
// is NOT a member of a private pod can still read and edit that pod's
// sandbox settings through these routes (admins pass canAdministrate on
// spaces). If this flips to pod-editor or admin-and-member, change this
// middleware chain and the matching UI gate in PodSettingsTab together.
const app = workspaceApp();

app.use("*", ensureIsAdmin());
app.use("*", withSandboxFunctionsFeature());

app.route("/egress-policy", egressPolicy);

export default app;
