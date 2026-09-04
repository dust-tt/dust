import { workspaceApp } from "@front-api/middlewares/ctx";

import editText from "./edit-text";
import functions from "./functions";
import invocations from "./invocations";
import permissions from "./permissions";

const app = workspaceApp();

app.route("/edit-text", editText);
app.route("/functions", functions);
app.route("/invocations", invocations);
app.route("/permissions", permissions);

export default app;
