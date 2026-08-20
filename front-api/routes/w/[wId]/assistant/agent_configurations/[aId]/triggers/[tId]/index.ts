import { workspaceApp } from "@front-api/middlewares/ctx";

import executionMode from "./execution_mode";
import status from "./status";
import webhookRequests from "./webhook_requests";

// Mounted under /api/w/:wId/assistant/agent_configurations/:aId/triggers/:tId.
const app = workspaceApp();

app.route("/execution_mode", executionMode);
app.route("/status", status);
app.route("/webhook_requests", webhookRequests);

export default app;
