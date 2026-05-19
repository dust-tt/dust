import { Hono } from "hono";

import location from "./location";

// Mounted under /api/geo.
const app = new Hono();

app.route("/location", location);

export default app;
