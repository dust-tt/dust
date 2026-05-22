import { workspaceApp } from "@front-api/middlewares/ctx";

import suggestions from "./suggestions";

// Mounted at /api/w/:wId/assistant/conversations/:cId/mentions.
const app = workspaceApp();

app.route("/suggestions", suggestions);

export default app;
