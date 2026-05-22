import { Hono } from "hono";

import pv from "./pv";

// Mounted at /api/t.
const app = new Hono();

app.route("/pv", pv);

export default app;
