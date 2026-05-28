import { createHono } from "@front-api/lib/hono";

import webhookSourceUrlSecret from "./[webhookSourceUrlSecret]";

// Mounted at /api/v1/w/:wId/triggers/hooks/:webhookSourceId.
const app = createHono();

app.route("/:webhookSourceUrlSecret", webhookSourceUrlSecret);

export default app;
