import { Hono } from "hono";

import connectionType from "./[connectionType]";

// Mounted under /api/w/:wId/mcp/connections.
const app = new Hono();

app.route("/:connectionType", connectionType);

export default app;
