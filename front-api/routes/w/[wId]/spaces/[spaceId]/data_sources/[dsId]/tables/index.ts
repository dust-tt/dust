import { workspaceApp } from "@front-api/middlewares/ctx";

import tableId from "./[tableId]";

// Mounted under /api/w/:wId/spaces/:spaceId/data_sources/:dsId/tables.
const app = workspaceApp();

app.route("/:tableId", tableId);

export default app;
