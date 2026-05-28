import { createHono } from "@front-api/lib/hono";

import webhook from "./webhook";

// Mounted at /api/metronome.
const app = createHono();

app.route("/webhook", webhook);

export default app;
