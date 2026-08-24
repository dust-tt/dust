import { workspaceApp } from "@front-api/middlewares/ctx";

import automations from "./automations";

// Mounted under /api/w/:wId/me/analytics.
const app = workspaceApp();

app.route("/automations", automations);

export default app;
