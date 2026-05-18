import { Hono } from "hono";

import assistants from "./assistants";
import skills from "./skills";

// Mounted under /api/w/:wId/builder. workspaceAuth is applied by the parent
// workspace sub-app.
const app = new Hono();

app.route("/assistants", assistants);
app.route("/skills", skills);

export default app;
