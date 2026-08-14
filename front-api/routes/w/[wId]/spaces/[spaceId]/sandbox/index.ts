import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { withComputerFeature } from "@front-api/middlewares/with_computer_feature";

import egressPolicy from "./egress-policy";
import envVars from "./env-vars";

// Mounted at /api/w/:wId/spaces/:spaceId/sandbox. The workspace-admin and
// Computer feature gates are applied here so every leaf below inherits
// them. Pod Computer settings share the workspace-level Computer flag with
// the workspace sandbox routes and the central Computer admin page —
// `sandbox_functions` gates Pod Function invocation only, not these
// settings.
//
// Access-control decision (v0, deliberate): workspace-admin only, with pod
// membership intentionally not consulted. This means a workspace admin who
// is NOT a member of a private pod can still read and edit that pod's
// sandbox settings through these routes (admins pass canAdministrate on
// spaces). If this flips to pod-editor or admin-and-member, change this
// middleware chain and the matching UI gate (useComputerAdminAccess)
// together.
const app = workspaceApp();

app.use("*", ensureIsAdmin());
app.use("*", withComputerFeature());

app.route("/egress-policy", egressPolicy);
app.route("/env-vars", envVars);

export default app;
