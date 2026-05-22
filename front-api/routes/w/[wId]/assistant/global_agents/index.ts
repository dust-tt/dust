import { workspaceApp } from "@front-api/middlewares/ctx";

import agent from "./[aId]";

// Mounted at /api/w/:wId/assistant/global_agents.
const app = workspaceApp();

app.route("/:aId", agent);

export default app;
