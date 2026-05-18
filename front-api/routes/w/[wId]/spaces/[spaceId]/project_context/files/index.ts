import { Hono } from "hono";

import fileId from "./[fileId]";

// Mounted under /api/w/:wId/spaces/:spaceId/project_context/files.
const app = new Hono();

app.route("/:fileId", fileId);

export default app;
