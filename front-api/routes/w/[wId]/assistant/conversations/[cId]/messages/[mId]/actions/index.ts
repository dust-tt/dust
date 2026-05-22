import { workspaceApp } from "@front-api/middleware/env";

import action from "./[aId]";

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/actions.
const app = workspaceApp();

app.route("/:aId", action);

export default app;
