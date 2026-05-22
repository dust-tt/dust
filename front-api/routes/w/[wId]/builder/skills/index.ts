import { workspaceApp } from "@front-api/middlewares/ctx";

import suggestions from "./suggestions";

// Mounted under /api/w/:wId/builder/skills.
const app = workspaceApp();

app.route("/suggestions", suggestions);

export default app;
