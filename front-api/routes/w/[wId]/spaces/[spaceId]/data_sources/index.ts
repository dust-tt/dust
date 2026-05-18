import { Hono } from "hono";

import dsId from "./[dsId]";

// Mounted under /api/w/:wId/spaces/:spaceId/data_sources.
const app = new Hono();

app.route("/:dsId", dsId);

export default app;
