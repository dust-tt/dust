import { Hono } from "hono";

import actions from "./actions";

// Mounted under /api/w/:wId/builder/assistants/:aId.
const app = new Hono();

app.route("/actions", actions);

export default app;
