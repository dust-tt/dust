import { Hono } from "hono";

import prompt from "./prompt";

// Mounted under /api/w/:wId/assistant/builder/sidekick.
const app = new Hono();

app.route("/prompt", prompt);

export default app;
