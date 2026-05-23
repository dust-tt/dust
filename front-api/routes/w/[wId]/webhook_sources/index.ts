import { workspaceApp } from "@front-api/middlewares/ctx";

import views from "./views";

// Mounted at /api/w/:wId/webhook_sources.
const app = workspaceApp();

app.route("/views", views);

export default app;
