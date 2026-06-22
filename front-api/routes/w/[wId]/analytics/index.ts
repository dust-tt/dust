import { workspaceApp } from "@front-api/middlewares/ctx";
import activeUsers from "./active-users";
import activeUsersExport from "./active-users-export";
import agentCredits from "./agent-credits";
import agentsExport from "./agents-export";
import awuUsage from "./awu-usage";
import awuUsageAnalytics from "./awu-usage-analytics";
import metronomeUsage from "./metronome-usage";
import overview from "./overview";
import programmaticCost from "./programmatic-cost";
import programmaticCostExport from "./programmatic-cost-export";
import skillUsage from "./skill-usage";
import skillUsageExport from "./skill-usage-export";
import skills from "./skills";
import source from "./source";
import sourceExport from "./source-export";
import toolUsage from "./tool-usage";
import toolUsageExport from "./tool-usage-export";
import tools from "./tools";
import topAgents from "./top-agents";
import topUsers from "./top-users";
import usageMetrics from "./usage-metrics";
import usageMetricsExport from "./usage-metrics-export";
import userCredits from "./user-credits";
import usersExport from "./users-export";

// Mounted at /api/w/:wId/analytics. workspaceAuth is applied by the parent
// workspace sub-app.
const app = workspaceApp();

app.route("/active-users-export", activeUsersExport);
app.route("/active-users", activeUsers);
app.route("/agent-credits", agentCredits);
app.route("/agents-export", agentsExport);
app.route("/awu-usage", awuUsage);
app.route("/awu-usage-analytics", awuUsageAnalytics);
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
app.route("/user-credits", userCredits);
app.route("/users-export", usersExport);

export default app;
