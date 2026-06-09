import { workspaceApp } from "@front-api/middlewares/ctx";

import blocked from "./blocked";

// Mounted at /api/w/:wId/assistant/conversations/:cId/actions.
const app = workspaceApp();

app.route("/blocked", blocked);

export default app;
