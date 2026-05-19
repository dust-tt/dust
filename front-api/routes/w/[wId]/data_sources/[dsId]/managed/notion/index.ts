import { Hono } from "hono";

import webhookConfig from "./webhook_config";

// Mounted under /api/w/:wId/data_sources/:dsId/managed/notion.
const app = new Hono();

app.route("/webhook_config", webhookConfig);

export default app;
