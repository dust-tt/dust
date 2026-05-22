import { workspaceApp } from "@front-api/middlewares/ctx";

import fId from "./[fId]";

// Mounted under /api/w/:wId/spaces/:spaceId/data_sources/:dsId/folders.
const app = workspaceApp();

app.route("/:fId", fId);

export default app;
