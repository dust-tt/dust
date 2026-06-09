import { workspaceApp } from "@front-api/middlewares/ctx";

import agentFavorite from "./agent_favorite";

// Mounted under /api/w/:wId/members/me.
const app = workspaceApp();

app.route("/agent_favorite", agentFavorite);

export default app;
