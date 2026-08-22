import { workspaceApp } from "@front-api/middlewares/ctx";

import triggerBreakdown from "./trigger-breakdown";
import triggers from "./triggers";

// Mounted under /api/w/:wId/me/automations.
const app = workspaceApp();

app.route("/triggers", triggers);
app.route("/trigger-breakdown", triggerBreakdown);

export default app;
