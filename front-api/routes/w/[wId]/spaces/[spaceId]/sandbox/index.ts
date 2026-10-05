import { workspaceApp } from "@front-api/middlewares/ctx";

import egressPolicy from "./egress-policy";
import envVars from "./env-vars";

// Mounted at /api/w/:wId/spaces/:spaceId/sandbox. Access control is per leaf —
// egress-policy and env-vars open their reads to Pod readers, writes are
// workspace-admin only. The Computer feature flag gates the UI only
// (PodSettingsSection/PodSettingsAdvancedTab), not the routes.
const app = workspaceApp();

app.route("/egress-policy", egressPolicy);
app.route("/env-vars", envVars);

export default app;
