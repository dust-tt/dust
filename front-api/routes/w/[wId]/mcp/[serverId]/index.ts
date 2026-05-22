import { workspaceApp } from "@front-api/middleware/env";

import sync from "./sync";
import tools from "./tools";

// Mounted under /api/w/:wId/mcp/:serverId.
const app = workspaceApp();

app.route("/sync", sync);
app.route("/tools", tools);

export default app;
