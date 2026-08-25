import { pokeApp } from "@front-api/middlewares/ctx";

import details from "./details";
import executionStats from "./execution_stats";
import status from "./status";
import webhookRequests from "./webhook_requests";

const app = pokeApp();

app.route("/details", details);
app.route("/execution_stats", executionStats);
app.route("/status", status);
app.route("/webhook_requests", webhookRequests);

export default app;
