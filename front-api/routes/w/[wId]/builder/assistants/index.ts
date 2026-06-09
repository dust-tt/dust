import { workspaceApp } from "@front-api/middlewares/ctx";

import assistant from "./[aId]";

// Mounted under /api/w/:wId/builder/assistants.
const app = workspaceApp();

app.route("/:aId", assistant);

export default app;
