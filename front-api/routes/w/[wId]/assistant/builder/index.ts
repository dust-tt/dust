import { workspaceApp } from "@front-api/middlewares/ctx";

import process from "./process";
import sidekick from "./sidekick";
import slack from "./slack";
import suggestions from "./suggestions";

// Mounted under /api/w/:wId/assistant/builder.
const app = workspaceApp();

app.route("/suggestions", suggestions);
app.route("/process", process);
app.route("/sidekick", sidekick);
app.route("/slack", slack);

export default app;
