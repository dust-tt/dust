import { Hono } from "hono";

import fId from "./[fId]";

// Mounted under /api/w/:wId/spaces/:spaceId/data_sources/:dsId/folders.
const app = new Hono();

app.route("/:fId", fId);

export default app;
