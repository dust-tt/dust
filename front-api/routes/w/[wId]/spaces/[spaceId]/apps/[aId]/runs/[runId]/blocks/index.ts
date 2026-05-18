import { Hono } from "hono";

import type_ from "./[type]";

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/runs/:runId/blocks.
const app = new Hono();

app.route("/:type", type_);

export default app;
