import { Hono } from "hono";

import webhook from "./webhook";

// Mounted at /api/metronome.
const app = new Hono();

app.route("/webhook", webhook);

export default app;
