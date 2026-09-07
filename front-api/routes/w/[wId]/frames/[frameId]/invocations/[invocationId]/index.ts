import { workspaceApp } from "@front-api/middlewares/ctx";

import events from "./events";

const app = workspaceApp();

app.route("/events", events);

export default app;
