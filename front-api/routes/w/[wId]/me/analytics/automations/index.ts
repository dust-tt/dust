import { workspaceApp } from "@front-api/middlewares/ctx";

import triggers from "./triggers";

// Mounted under /api/w/:wId/me/analytics/automations.
const app = workspaceApp();

app.route("/triggers", triggers);

export default app;
