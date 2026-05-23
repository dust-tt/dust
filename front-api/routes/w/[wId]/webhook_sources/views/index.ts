import { workspaceApp } from "@front-api/middlewares/ctx";

import viewById from "./[viewId]";

// Mounted at /api/w/:wId/webhook_sources/views.
const app = workspaceApp();

app.route("/:viewId", viewById);

export default app;
