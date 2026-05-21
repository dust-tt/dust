import { pokeApp } from "@front-api/middlewares/ctx";

import activeUsers from "./active-users";
import metronomeUsage from "./metronome-usage";
import programmaticCost from "./programmatic-cost";
import usageMetrics from "./usage-metrics";

const app = pokeApp();

app.route("/active-users", activeUsers);
app.route("/metronome-usage", metronomeUsage);
app.route("/programmatic-cost", programmaticCost);
app.route("/usage-metrics", usageMetrics);

export default app;
