import { workspaceApp } from "@front-api/middlewares/ctx";
import { createSkillConsumptionRoutes } from "@front-api/routes/w/[wId]/analytics/consumption";

// Mounted under /api/w/:wId/skills/:sId/analytics.
const app = workspaceApp();
const consumption = createSkillConsumptionRoutes();

app.route("/consumption", consumption);

export default app;
