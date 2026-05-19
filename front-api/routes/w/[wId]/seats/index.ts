import { Hono } from "hono";

import plan from "./plan";

// Mounted under /api/w/:wId/seats.
const app = new Hono();

app.route("/plan", plan);

export default app;
