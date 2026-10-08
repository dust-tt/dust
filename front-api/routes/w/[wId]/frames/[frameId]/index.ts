import { workspaceApp } from "@front-api/middlewares/ctx";

import functions from "./functions";
import invocations from "./invocations";
import permissions from "./permissions";
import source from "./source";
import trust from "./trust";

const app = workspaceApp();

app.route("/functions", functions);
app.route("/invocations", invocations);
app.route("/permissions", permissions);
app.route("/source", source);
app.route("/trust", trust);

export default app;
