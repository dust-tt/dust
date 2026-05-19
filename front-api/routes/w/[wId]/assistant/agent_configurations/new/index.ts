import { Hono } from "hono";

import yaml from "./yaml";

// Mounted under /api/w/:wId/assistant/agent_configurations/new.
const app = new Hono();

app.route("/yaml", yaml);

export default app;
