import { Hono } from "hono";

import availability from "./availability";
import count from "./count";
import plan from "./plan";

// Mounted at /api/w/:wId/seats. workspaceAuth is applied by the parent
// workspace sub-app.
const app = new Hono();

app.route("/availability", availability);
app.route("/count", count);
app.route("/plan", plan);

export default app;
