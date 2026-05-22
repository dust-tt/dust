import { workspaceApp } from "@front-api/middleware/env";

import prompt from "./prompt";

// Mounted under /api/w/:wId/assistant/builder/sidekick.
const app = workspaceApp();

app.route("/prompt", prompt);

export default app;
