import { Hono } from "hono";

import tool from "./[toolName]";

// Mounted under /api/w/:wId/mcp/:serverId/tools.
const app = new Hono();

app.route("/:toolName", tool);

export default app;
