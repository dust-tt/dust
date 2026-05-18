import { Hono } from "hono";

import connection from "./[cId]";

// Mounted under /api/w/:wId/mcp/connections/:connectionType.
const app = new Hono();

app.route("/:cId", connection);

export default app;
