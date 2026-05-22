import { workspaceApp } from "@front-api/middleware/env";

import suggestions from "./suggestions";

// Mounted under /api/w/:wId/builder/skills.
const app = workspaceApp();

app.route("/suggestions", suggestions);

export default app;
