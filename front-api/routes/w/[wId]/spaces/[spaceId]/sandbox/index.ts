import { workspaceApp } from "@front-api/middlewares/ctx";
import { withSandboxFunctionsFeature } from "@front-api/middlewares/with_sandbox_functions_feature";

import egressPolicy from "./egress-policy";
import envVars from "./env-vars";

// Mounted at /api/w/:wId/spaces/:spaceId/sandbox. Only the `sandbox_functions`
// feature gate is applied here so every leaf below inherits it; access control
// is decided per leaf.
//
// Access-control decision: the egress-policy leaf opens reads (GET) to anyone
// who can read the Pod so members see the Pod's network settings read-only,
// while its writes require a workspace admin. The env-vars leaf stays
// workspace-admin only (it re-applies `ensureIsAdmin` for every route). Pod
// membership is deliberately not consulted for edit. If the edit gate flips to
// pod-editor, change the leaf handlers and the matching UI gate in
// PodSettingsTab together.
const app = workspaceApp();

app.use("*", withSandboxFunctionsFeature());

app.route("/egress-policy", egressPolicy);
app.route("/env-vars", envVars);

export default app;
