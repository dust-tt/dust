import { createHono } from "@front-api/lib/hono";

import pv from "./pv";

// Mounted at /api/t.
const app = createHono();

app.route("/pv", pv);

export default app;
