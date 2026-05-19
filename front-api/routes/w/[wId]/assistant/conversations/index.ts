import { Hono } from "hono";

import conversation from "./[cId]";

// Mounted under /api/w/:wId/assistant/conversations.
const app = new Hono();

app.route("/:cId", conversation);

export default app;
