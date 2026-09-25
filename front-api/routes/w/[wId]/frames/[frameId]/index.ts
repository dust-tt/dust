import { workspaceApp } from "@front-api/middlewares/ctx";

import functions from "./functions";
import invocations from "./invocations";
import permissions from "./permissions";
import source from "./source";

const app = workspaceApp();

app.route("/functions", functions);
app.route("/invocations", invocations);
app.route("/permissions", permissions);
app.route("/source", source);

export default app;
