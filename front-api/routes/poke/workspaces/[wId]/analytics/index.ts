import { pokeWorkspaceApp } from "@front-api/middleware/env";

import activeUsers from "./active-users";
import usageMetrics from "./usage-metrics";

const app = pokeWorkspaceApp();

app.route("/active-users", activeUsers);
app.route("/usage-metrics", usageMetrics);

export default app;
