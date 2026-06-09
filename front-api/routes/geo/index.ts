import { createHono } from "@front-api/lib/hono";

import location from "./location";

// Mounted under /api/geo.
const app = createHono();

app.route("/location", location);

export default app;
