import { workspaceApp } from "@front-api/middlewares/ctx";

import invocations from "./invocations";

const app = workspaceApp();

app.route("/invocations", invocations);

export default app;
