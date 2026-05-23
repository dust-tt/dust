import { workspaceApp } from "@front-api/middlewares/ctx";

import task from "./[taskSId]";

// Mounted at /api/w/:wId/project_tasks.
const app = workspaceApp();

app.route("/:taskSId", task);

export default app;
