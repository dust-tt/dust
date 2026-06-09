import { workspaceApp } from "@front-api/middlewares/ctx";

import parse from "./parse";
import suggestions from "./suggestions";

// Mounted under /api/w/:wId/assistant/mentions.
const app = workspaceApp();

app.route("/parse", parse);
app.route("/suggestions", suggestions);

export default app;
