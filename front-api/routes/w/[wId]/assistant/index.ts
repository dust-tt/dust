import { Hono } from "hono";

import builder from "./builder";
import mentions from "./mentions";
import skills from "./skills";

// Mounted at /api/w/:wId/assistant. workspaceAuth is applied by the parent
// workspace sub-app.
const app = new Hono();

app.route("/builder", builder);
app.route("/mentions", mentions);
app.route("/skills", skills);

export default app;
