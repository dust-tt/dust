import { workspaceApp } from "@front-api/middlewares/ctx";

import functions from "./functions";

const app = workspaceApp();

app.route("/functions", functions);

export default app;
