import { Hono } from "hono";

import suggestions from "./suggestions";

// Mounted under /api/w/:wId/builder/skills.
const app = new Hono();

app.route("/suggestions", suggestions);

export default app;
