import { pokeApp } from "@front-api/middlewares/ctx";

import activeUsers from "./active-users";
import awuUsageAnalytics from "./awu-usage-analytics";
import programmaticCost from "./programmatic-cost";
import usageMetrics from "./usage-metrics";

const app = pokeApp();

app.route("/active-users", activeUsers);
app.route("/awu-usage-analytics", awuUsageAnalytics);
app.route("/programmatic-cost", programmaticCost);
app.route("/usage-metrics", usageMetrics);

export default app;
