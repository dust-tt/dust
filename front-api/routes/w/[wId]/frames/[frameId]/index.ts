import { workspaceApp } from "@front-api/middlewares/ctx";

import functions from "./functions";
import invocations from "./invocations";

const app = workspaceApp();

app.route("/functions", functions);
app.route("/invocations", invocations);

export default app;
