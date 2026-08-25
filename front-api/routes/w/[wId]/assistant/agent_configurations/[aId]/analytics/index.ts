import { workspaceApp } from "@front-api/middlewares/ctx";
import { createAgentConsumptionRoutes } from "@front-api/routes/w/[wId]/analytics/consumption";

// Mounted under /api/w/:wId/assistant/agent_configurations/:aId/analytics.
const app = workspaceApp();
const consumption = createAgentConsumptionRoutes();

app.route("/consumption", consumption);

export default app;
