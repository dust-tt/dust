import { Hono } from "hono";

import documentId from "./[documentId]";

// Mounted under
// /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId/documents.
const app = new Hono();

app.route("/:documentId", documentId);

export default app;
