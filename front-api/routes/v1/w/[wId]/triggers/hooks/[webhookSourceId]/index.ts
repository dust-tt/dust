import { Hono } from "hono";

import webhookSourceUrlSecret from "./[webhookSourceUrlSecret]";

// Mounted at /api/v1/w/:wId/triggers/hooks/:webhookSourceId.
const app = new Hono();

app.route("/:webhookSourceUrlSecret", webhookSourceUrlSecret);

export default app;
