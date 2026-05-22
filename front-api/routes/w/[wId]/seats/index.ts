import { workspaceApp } from "@front-api/middleware/env";

import availability from "./availability";
import count from "./count";
import plan from "./plan";

// Mounted at /api/w/:wId/seats.
const app = workspaceApp();

app.route("/availability", availability);
app.route("/count", count);
app.route("/plan", plan);

export default app;
