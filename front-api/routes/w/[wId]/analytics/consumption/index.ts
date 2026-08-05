import { workspaceApp } from "@front-api/middlewares/ctx";
import overview from "./overview";
import timeseries from "./timeseries";
import topAgents from "./top-agents";
import topModels from "./top-models";
import topSkills from "./top-skills";
import topSources from "./top-sources";
import topTools from "./top-tools";
import topUsers from "./top-users";

// Mounted at /api/w/:wId/analytics/consumption — the endpoints backed by the
// consumption index (`front.agent_message_consumption_analytics`), one document
// per unit of credit consumption. workspaceAuth is applied by the parent
// workspace sub-app.
const app = workspaceApp();

app.route("/overview", overview);
app.route("/timeseries", timeseries);
app.route("/top-agents", topAgents);
app.route("/top-models", topModels);
app.route("/top-skills", topSkills);
app.route("/top-sources", topSources);
app.route("/top-tools", topTools);
app.route("/top-users", topUsers);

export default app;
