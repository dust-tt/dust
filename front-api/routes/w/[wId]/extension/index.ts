import { workspaceApp } from "@front-api/middlewares/ctx";

import config from "./config";

// Mounted under /api/w/:wId/extension.
const app = workspaceApp();

app.route("/config", config);

export default app;
