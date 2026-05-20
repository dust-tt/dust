import { Hono } from "hono";

import blocked from "./blocked";

// Mounted at /api/w/:wId/assistant/conversations/:cId/actions.
const app = new Hono();

app.route("/blocked", blocked);

export default app;
