import { workspaceApp } from "@front-api/middleware/env";

import connectionType from "./[connectionType]";

// Mounted under /api/w/:wId/mcp/connections.
const app = workspaceApp();

app.route("/:connectionType", connectionType);

export default app;
