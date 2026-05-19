import { Hono } from "hono";

import metronomeUsage from "./metronome-usage";
import programmaticCost from "./programmatic-cost";

// Mounted under /api/w/:wId/analytics.
const app = new Hono();

app.route("/metronome-usage", metronomeUsage);
app.route("/programmatic-cost", programmaticCost);

export default app;
