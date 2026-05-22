import { workspaceApp } from "@front-api/middlewares/ctx";

import yaml from "./yaml";

// Mounted under /api/w/:wId/assistant/agent_configurations/:aId/export.
const app = workspaceApp();

app.route("/yaml", yaml);

export default app;
