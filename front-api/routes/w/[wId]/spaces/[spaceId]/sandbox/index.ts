import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

import egressPolicy from "./egress-policy";
import envVars from "./env-vars";

// Mounted at /api/w/:wId/spaces/:spaceId/sandbox. The workspace-admin and
// `sandbox_functions` feature gates are applied here so every leaf below
// inherits them. Kept aligned with the request_egress_domain tool, which is
// also sandbox_functions-gated, so a Pod domain can only be requested where
// this review surface exists.
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
app.use("*", withFeatureFlag("sandbox_functions"));

app.route("/egress-policy", egressPolicy);
app.route("/env-vars", envVars);

export default app;
