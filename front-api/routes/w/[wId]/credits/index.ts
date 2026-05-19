import { Hono } from "hono";

import awuPoolSummary from "./awu-pool-summary";
import metronomeBalances from "./metronome-balances";

// Mounted under /api/w/:wId/credits.
const app = new Hono();

app.route("/awu-pool-summary", awuPoolSummary);
app.route("/metronome-balances", metronomeBalances);

export default app;
