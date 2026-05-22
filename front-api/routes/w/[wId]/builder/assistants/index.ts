import { workspaceApp } from "@front-api/middleware/env";

import assistant from "./[aId]";

// Mounted under /api/w/:wId/builder/assistants.
const app = workspaceApp();

app.route("/:aId", assistant);

export default app;
