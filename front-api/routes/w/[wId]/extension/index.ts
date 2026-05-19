import { Hono } from "hono";

import config from "./config";

// Mounted under /api/w/:wId/extension.
const app = new Hono();

app.route("/config", config);

export default app;
