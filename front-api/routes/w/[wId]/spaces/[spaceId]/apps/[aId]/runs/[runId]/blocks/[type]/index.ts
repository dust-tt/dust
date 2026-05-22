import { workspaceApp } from "@front-api/middlewares/ctx";

import name from "./[name]";

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/runs/:runId/blocks/:type.
const app = workspaceApp();

app.route("/:name", name);

export default app;
