import { Hono } from "hono";

import { workspaceAuth } from "@front-api/middleware/workspace_auth";

import assistants from "./assistants";
import skills from "./skills";

// Mounted under /api/w/:wId/builder.
const app = new Hono();

app.use("*", workspaceAuth());

app.route("/assistants", assistants);
app.route("/skills", skills);

export default app;
