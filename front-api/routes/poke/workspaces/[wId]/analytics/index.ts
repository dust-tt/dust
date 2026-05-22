import { pokeApp } from "@front-api/middlewares/ctx";

import activeUsers from "./active-users";
import usageMetrics from "./usage-metrics";

const app = pokeApp();

app.route("/active-users", activeUsers);
app.route("/usage-metrics", usageMetrics);

export default app;
