import { workspaceApp } from "@front-api/middleware/env";

import type_ from "./[type]";

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/runs/:runId/blocks.
const app = workspaceApp();

app.route("/:type", type_);

export default app;
