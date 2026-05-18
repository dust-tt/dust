import { Hono } from "hono";

import sync from "./sync";
import tools from "./tools";

// Mounted under /api/w/:wId/mcp/:serverId.
const app = new Hono();

app.route("/sync", sync);
app.route("/tools", tools);

export default app;
