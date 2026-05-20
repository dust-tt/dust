import { Hono } from "hono";

import agentFavorite from "./agent_favorite";

// Mounted under /api/w/:wId/members/me.
const app = new Hono();

app.route("/agent_favorite", agentFavorite);

export default app;
