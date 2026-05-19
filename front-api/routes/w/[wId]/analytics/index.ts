import { Hono } from "hono";

import activeUsers from "./active-users";
import metronomeUsage from "./metronome-usage";
import overview from "./overview";
import programmaticCost from "./programmatic-cost";
import skillUsage from "./skill-usage";
import skills from "./skills";
import source from "./source";
import tools from "./tools";
import topAgents from "./top-agents";
import topUsers from "./top-users";
import usageMetrics from "./usage-metrics";

// Mounted at /api/w/:wId/analytics. workspaceAuth is applied by the parent
// workspace sub-app.
const app = new Hono();

app.route("/active-users", activeUsers);
app.route("/metronome-usage", metronomeUsage);
app.route("/overview", overview);
app.route("/programmatic-cost", programmaticCost);
app.route("/skill-usage", skillUsage);
app.route("/skills", skills);
app.route("/source", source);
app.route("/tools", tools);
app.route("/top-agents", topAgents);
app.route("/top-users", topUsers);
app.route("/usage-metrics", usageMetrics);

export default app;
