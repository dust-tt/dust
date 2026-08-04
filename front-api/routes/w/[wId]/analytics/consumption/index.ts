import { workspaceApp } from "@front-api/middlewares/ctx";
import overview from "./overview";
import timeseries from "./timeseries";

// Mounted at /api/w/:wId/analytics/consumption — the endpoints backed by the
// consumption index (`front.agent_message_consumption_analytics`), one document
// per unit of credit consumption. workspaceAuth is applied by the parent
// workspace sub-app.
const app = workspaceApp();

app.route("/overview", overview);
app.route("/timeseries", timeseries);

export default app;
