import { Hono } from "hono";

import available from "./available";

// Mounted under /api/w/:wId/spaces/:spaceId/mcp.
const app = new Hono();

app.route("/available", available);

export default app;
