import { workspaceApp } from "@front-api/middlewares/ctx";

import trending from "./trending";

const app = workspaceApp();

app.route("/trending", trending);

export default app;
