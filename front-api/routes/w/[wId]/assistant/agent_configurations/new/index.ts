import { workspaceApp } from "@front-api/middleware/env";

import yaml from "./yaml";

// Mounted under /api/w/:wId/assistant/agent_configurations/new.
const app = workspaceApp();

app.route("/yaml", yaml);

export default app;
