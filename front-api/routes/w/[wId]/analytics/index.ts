import { workspaceApp } from "@front-api/middlewares/ctx";
import automations from "./automations";
import { createWorkspaceConsumptionRoutes } from "./consumption";
import exportTableRoute from "./export";
import programmaticCost from "./programmatic-cost";
import programmaticCostExport from "./programmatic-cost-export";

// Mounted at /api/w/:wId/analytics. workspaceAuth is applied by the parent
// workspace sub-app.
const app = workspaceApp();
const consumption = createWorkspaceConsumptionRoutes();

app.route("/automations", automations);
app.route("/consumption", consumption);
app.route("/export", exportTableRoute);
app.route("/programmatic-cost-export", programmaticCostExport);
app.route("/programmatic-cost", programmaticCost);

export default app;
