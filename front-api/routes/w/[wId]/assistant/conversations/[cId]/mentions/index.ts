import { Hono } from "hono";

import suggestions from "./suggestions";

// Mounted at /api/w/:wId/assistant/conversations/:cId/mentions.
const app = new Hono();

app.route("/suggestions", suggestions);

export default app;
