import { createHono } from "@front-api/lib/hono";

import company from "./company";

// Mounted at /api/enrichment.
const app = createHono();

app.route("/company", company);

export default app;
