import { publicApiApp } from "@front-api/middlewares/ctx";

import yaml from "./yaml";

// Mounted at /api/v1/w/:wId/assistant/agent_configurations/:sId/export.
const app = publicApiApp();

app.route("/yaml", yaml);

export default app;
