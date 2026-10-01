import { workspaceApp } from "@front-api/middlewares/ctx";
import { withSandboxFunctionInvocationFeature } from "@front-api/middlewares/with_sandbox_functions_feature";

import egressPolicy from "./egress-policy";
import envVars from "./env-vars";

// Mounted at /api/w/:wId/spaces/:spaceId/sandbox. Only the Frame functions
// gate is applied here; access control is per leaf — egress-policy and
// env-vars open their reads to Pod readers, writes are workspace-admin only.
// Keep in sync with the UI gates in PodSettingsSection/PodSettingsAdvancedTab.
const app = workspaceApp();

app.use("*", withSandboxFunctionInvocationFeature());

app.route("/egress-policy", egressPolicy);
app.route("/env-vars", envVars);

export default app;
