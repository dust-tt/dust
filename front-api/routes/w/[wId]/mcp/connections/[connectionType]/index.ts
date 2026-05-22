import { workspaceApp } from "@front-api/middleware/env";

import connection from "./[cId]";

// Mounted under /api/w/:wId/mcp/connections/:connectionType.
const app = workspaceApp();

app.route("/:cId", connection);

export default app;
