import { workspaceApp } from "@front-api/middleware/env";

import webhookConfig from "./webhook_config";

// Mounted under /api/w/:wId/data_sources/:dsId/managed/notion.
const app = workspaceApp();

app.route("/webhook_config", webhookConfig);

export default app;
