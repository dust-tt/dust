import { createHono } from "@front-api/lib/hono";

import profiler from "./profiler";

// Mounted at /api/debug.
const app = createHono();

app.route("/profiler", profiler);

export default app;
