import { workspaceApp } from "@front-api/middlewares/ctx";

import task from "./[taskId]";

// Mounted at /api/w/:wId/project_tasks.
const app = workspaceApp();

app.route("/:taskId", task);

export default app;
