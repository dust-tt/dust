import { Hono } from "hono";

import profiler from "./profiler";

// Mounted at /api/debug.
const app = new Hono();

app.route("/profiler", profiler);

export default app;
