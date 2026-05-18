import { Hono } from "hono";

import name from "./[name]";

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/runs/:runId/blocks/:type.
const app = new Hono();

app.route("/:name", name);

export default app;
