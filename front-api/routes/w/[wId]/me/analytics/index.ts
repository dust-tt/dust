import { workspaceApp } from "@front-api/middlewares/ctx";

import { createPersonalConsumptionRoutes } from "../../analytics/consumption";
import automations from "./automations";

// Mounted under /api/w/:wId/me/analytics.
const app = workspaceApp();
const consumption = createPersonalConsumptionRoutes();

app.route("/automations", automations);
app.route("/consumption", consumption);

export default app;
