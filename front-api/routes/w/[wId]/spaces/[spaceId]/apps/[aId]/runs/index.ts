import { Hono } from "hono";

import runId from "./[runId]";

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/runs.
const app = new Hono();

app.route("/:runId", runId);

export default app;
