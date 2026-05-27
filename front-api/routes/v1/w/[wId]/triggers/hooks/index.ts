import { Hono } from "hono";

import webhookSourceId from "./[webhookSourceId]";

// Mounted at /api/v1/w/:wId/triggers/hooks.
const app = new Hono();

app.route("/:webhookSourceId", webhookSourceId);

export default app;
