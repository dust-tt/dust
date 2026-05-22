import { workspaceApp } from "@front-api/middlewares/ctx";

import type_ from "./[type]";

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/runs/:runId/blocks.
const app = workspaceApp();

app.route("/:type", type_);

export default app;
