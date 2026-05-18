import { Hono } from "hono";

import assistant from "./[aId]";

// Mounted under /api/w/:wId/builder/assistants.
const app = new Hono();

app.route("/:aId", assistant);

export default app;
