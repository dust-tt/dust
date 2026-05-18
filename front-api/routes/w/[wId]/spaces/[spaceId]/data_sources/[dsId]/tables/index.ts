import { Hono } from "hono";

import tableId from "./[tableId]";

// Mounted under /api/w/:wId/spaces/:spaceId/data_sources/:dsId/tables.
const app = new Hono();

app.route("/:tableId", tableId);

export default app;
