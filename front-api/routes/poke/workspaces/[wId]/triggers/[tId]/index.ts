import { Hono } from "hono";

import details from "./details";
import executionStats from "./execution_stats";
import webhookRequests from "./webhook_requests";

const app = new Hono();

app.route("/details", details);
app.route("/execution_stats", executionStats);
app.route("/webhook_requests", webhookRequests);

export default app;
