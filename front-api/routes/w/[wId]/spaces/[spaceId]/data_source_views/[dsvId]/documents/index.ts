import { workspaceApp } from "@front-api/middleware/env";

import documentId from "./[documentId]";

// Mounted under
// /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId/documents.
const app = workspaceApp();

app.route("/:documentId", documentId);

export default app;
