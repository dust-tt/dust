import { createHono } from "@front-api/lib/hono";

import webhookSourceId from "./[webhookSourceId]";

// Mounted at /api/v1/w/:wId/triggers/hooks.
const app = createHono();

app.route("/:webhookSourceId", webhookSourceId);

export default app;
