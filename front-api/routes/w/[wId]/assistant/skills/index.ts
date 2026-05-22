import { workspaceApp } from "@front-api/middleware/env";

import skill from "./[sId]";

// Mounted under /api/w/:wId/assistant/skills.
const app = workspaceApp();

app.route("/:sId", skill);

export default app;
