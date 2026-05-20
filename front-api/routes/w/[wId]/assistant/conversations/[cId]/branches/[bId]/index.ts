import { Hono } from "hono";

import close from "./close";
import merge from "./merge";

// Mounted at /api/w/:wId/assistant/conversations/:cId/branches/:bId.
const app = new Hono();

app.route("/close", close);
app.route("/merge", merge);

export default app;
