import { Hono } from "hono";

import company from "./company";

// Mounted at /api/enrichment.
const app = new Hono();

app.route("/company", company);

export default app;
