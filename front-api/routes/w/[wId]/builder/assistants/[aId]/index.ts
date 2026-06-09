import { workspaceApp } from "@front-api/middlewares/ctx";

import actions from "./actions";

// Mounted under /api/w/:wId/builder/assistants/:aId.
const app = workspaceApp();

app.route("/actions", actions);

export default app;
