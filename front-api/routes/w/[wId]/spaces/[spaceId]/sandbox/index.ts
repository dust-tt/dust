import { workspaceApp } from "@front-api/middlewares/ctx";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

import egressPolicy from "./egress-policy";
import envVars from "./env-vars";

// Mounted at /api/w/:wId/spaces/:spaceId/sandbox. Only the `frames_v2`
// gate is applied here; access control is per leaf — egress-policy opens GET to
// Pod readers (writes admin-only), env-vars stays admin-only. Keep in sync with
// the UI gate in PodSettingsTab.
const app = workspaceApp();

app.use("*", withFeatureFlag("frames_v2"));

app.route("/egress-policy", egressPolicy);
app.route("/env-vars", envVars);

export default app;
