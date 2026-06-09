import { workspaceApp } from "@front-api/middlewares/ctx";

import webhookRequests from "./webhook_requests";

// Mounted under /api/w/:wId/assistant/agent_configurations/:aId/triggers/:tId.
const app = workspaceApp();

app.route("/webhook_requests", webhookRequests);

export default app;
