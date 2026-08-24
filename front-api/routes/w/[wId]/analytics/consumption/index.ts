import { workspaceApp } from "@front-api/middlewares/ctx";
import exportRawRoute from "./export-raw";
import exportTableRoute from "./export-table";
import facets from "./facets";
import overview from "./overview";
import timeseries from "./timeseries";
import topAgents from "./top-agents";
import topApiKeys from "./top-api-keys";
import topGroups from "./top-groups";
import topModels from "./top-models";
import topSkills from "./top-skills";
import topSources from "./top-sources";
import topTools from "./top-tools";
import topUsers from "./top-users";

const app = workspaceApp();

app.route("/export-raw", exportRawRoute);
app.route("/export-table", exportTableRoute);
app.route("/facets", facets);
app.route("/overview", overview);
app.route("/timeseries", timeseries);
app.route("/top-agents", topAgents);
app.route("/top-api-keys", topApiKeys);
app.route("/top-models", topModels);
app.route("/top-skills", topSkills);
app.route("/top-sources", topSources);
app.route("/top-groups", topGroups);
app.route("/top-tools", topTools);
app.route("/top-users", topUsers);

export default app;
