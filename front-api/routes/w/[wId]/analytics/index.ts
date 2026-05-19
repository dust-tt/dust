import { Hono } from "hono";

import activeUsersExport from "./active-users-export";
import activeUsers from "./active-users";
import agentsExport from "./agents-export";
import metronomeUsage from "./metronome-usage";
import overview from "./overview";
import programmaticCostExport from "./programmatic-cost-export";
import programmaticCost from "./programmatic-cost";
import skillUsageExport from "./skill-usage-export";
import skillUsage from "./skill-usage";
import skills from "./skills";
import sourceExport from "./source-export";
import source from "./source";
import toolUsageExport from "./tool-usage-export";
import toolUsage from "./tool-usage";
import tools from "./tools";
import topAgents from "./top-agents";
import topUsers from "./top-users";
import usageMetricsExport from "./usage-metrics-export";
import usageMetrics from "./usage-metrics";
import usersExport from "./users-export";

// Mounted at /api/w/:wId/analytics. workspaceAuth is applied by the parent
// workspace sub-app.
const app = new Hono();

app.route("/active-users-export", activeUsersExport);
app.route("/active-users", activeUsers);
app.route("/agents-export", agentsExport);
app.route("/metronome-usage", metronomeUsage);
app.route("/overview", overview);
app.route("/programmatic-cost-export", programmaticCostExport);
app.route("/programmatic-cost", programmaticCost);
app.route("/skill-usage-export", skillUsageExport);
app.route("/skill-usage", skillUsage);
app.route("/skills", skills);
app.route("/source-export", sourceExport);
app.route("/source", source);
app.route("/tool-usage-export", toolUsageExport);
app.route("/tool-usage", toolUsage);
app.route("/tools", tools);
app.route("/top-agents", topAgents);
app.route("/top-users", topUsers);
app.route("/usage-metrics-export", usageMetricsExport);
app.route("/usage-metrics", usageMetrics);
app.route("/users-export", usersExport);

export default app;
