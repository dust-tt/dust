import { workspaceApp } from "@front-api/middlewares/ctx";

import functions from "./functions";
import invocations from "./invocations";
import permissions from "./permissions";

const app = workspaceApp();

app.route("/functions", functions);
app.route("/invocations", invocations);
app.route("/permissions", permissions);

export default app;
