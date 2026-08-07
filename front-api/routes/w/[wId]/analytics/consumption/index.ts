import { workspaceApp } from "@front-api/middlewares/ctx";
import overview from "./overview";
import relevantGroups from "./relevant-groups";
import timeseries from "./timeseries";
import topAgents from "./top-agents";
import topModels from "./top-models";
import topSkills from "./top-skills";
import topSources from "./top-sources";
import topTools from "./top-tools";
import topUsers from "./top-users";

const app = workspaceApp();

app.route("/overview", overview);
app.route("/relevant-groups", relevantGroups);
app.route("/timeseries", timeseries);
app.route("/top-agents", topAgents);
app.route("/top-models", topModels);
app.route("/top-skills", topSkills);
app.route("/top-sources", topSources);
app.route("/top-tools", topTools);
app.route("/top-users", topUsers);

export default app;
