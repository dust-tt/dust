import { workspaceApp } from "@front-api/middleware/env";

import available from "./available";

// Mounted under /api/w/:wId/spaces/:spaceId/mcp.
const app = workspaceApp();

app.route("/available", available);

export default app;
