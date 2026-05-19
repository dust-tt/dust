import { Hono } from "hono";

import { workspaceAuth } from "@front-api/middleware/workspace_auth";

import config from "./config";

// Mounted under /api/w/:wId/extension.
const app = new Hono();

app.use("*", workspaceAuth());

app.route("/config", config);

export default app;
