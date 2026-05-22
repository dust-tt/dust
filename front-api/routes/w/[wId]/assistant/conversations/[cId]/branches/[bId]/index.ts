import { workspaceApp } from "@front-api/middleware/env";

import close from "./close";
import merge from "./merge";

// Mounted at /api/w/:wId/assistant/conversations/:cId/branches/:bId.
const app = workspaceApp();

app.route("/close", close);
app.route("/merge", merge);

export default app;
