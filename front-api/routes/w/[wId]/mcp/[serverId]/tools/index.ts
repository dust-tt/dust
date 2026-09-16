import { workspaceApp } from "@front-api/middlewares/ctx";

import tool from "./[toolName]";

// Mounted under /api/w/:wId/mcp/:serverId/tools.
const app = workspaceApp();

app.route("/:toolName", tool);

export default app;
