import { workspaceApp } from "@front-api/middlewares/ctx";

import fileId from "./[fileId]";

// Mounted under /api/w/:wId/spaces/:spaceId/project_context/files.
const app = workspaceApp();

app.route("/:fileId", fileId);

export default app;
