import { Hono } from "hono";

import dsvId from "./[dsvId]";

// Mounted under /api/w/:wId/spaces/:spaceId/data_source_views.
const app = new Hono();

app.route("/:dsvId", dsvId);

export default app;
