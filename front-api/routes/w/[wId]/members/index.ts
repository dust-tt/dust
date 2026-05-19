import { Hono } from "hono";

import { workspaceAuth } from "@front-api/middleware/workspace_auth";

import lookup from "./lookup";
import search from "./search";

// Mounted under /api/w/:wId/members.
const app = new Hono();

app.use("*", workspaceAuth());

app.route("/lookup", lookup);
app.route("/search", search);

export default app;
