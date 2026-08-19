import { workspaceApp } from "@front-api/middlewares/ctx";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

import egressPolicy from "./egress-policy";
import envVars from "./env-vars";

// Mounted at /api/w/:wId/spaces/:spaceId/sandbox. The `sandbox_functions`
// feature gate is applied here so every leaf below inherits it. Kept aligned
// with the request_egress_domain tool, which is also sandbox_functions-gated,
// so a Pod domain can only be requested where this review surface exists.
//
// Access-control decision: reads (GET) are open to anyone who can read the
// Pod (each handler applies `requireCanReadOrAdministrate`), so members see
// the Pod's Computer settings read-only; writes require a workspace admin
// (each write handler applies `ensureIsAdmin`), with pod membership
// deliberately not consulted for edit. If the edit gate flips to pod-editor,
// change the write handlers and the matching UI gate (useComputerAdminAccess)
// together.
const app = workspaceApp();

app.use("*", withFeatureFlag("sandbox_functions"));

app.route("/egress-policy", egressPolicy);
app.route("/env-vars", envVars);

export default app;
