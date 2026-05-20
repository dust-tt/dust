import { Hono } from "hono";

import action from "./[aId]";

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/actions.
const app = new Hono();

app.route("/:aId", action);

export default app;
