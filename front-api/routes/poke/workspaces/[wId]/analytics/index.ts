import { Hono } from "hono";

import activeUsers from "./active-users";
import usageMetrics from "./usage-metrics";

const app = new Hono();

app.route("/active-users", activeUsers);
app.route("/usage-metrics", usageMetrics);

export default app;
