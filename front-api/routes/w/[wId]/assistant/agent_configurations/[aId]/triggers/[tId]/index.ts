import { Hono } from "hono";

import webhookRequests from "./webhook_requests";

// Mounted under /api/w/:wId/assistant/agent_configurations/:aId/triggers/:tId.
const app = new Hono();

app.route("/webhook_requests", webhookRequests);

export default app;
