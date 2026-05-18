import { Hono } from "hono";

import parse from "./parse";
import suggestions from "./suggestions";

// Mounted under /api/w/:wId/assistant/mentions.
const app = new Hono();

app.route("/parse", parse);
app.route("/suggestions", suggestions);

export default app;
