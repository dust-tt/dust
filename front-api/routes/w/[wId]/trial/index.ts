import { workspaceApp } from "@front-api/middleware/env";

import start from "./start";

// Mounted under /api/w/:wId/trial.
const app = workspaceApp();

app.route("/start", start);

export default app;
