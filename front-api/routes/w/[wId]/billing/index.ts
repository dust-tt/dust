import { workspaceApp } from "@front-api/middlewares/ctx";

import info from "./info";

// Mounted at /api/w/:wId/billing.
const app = workspaceApp();

app.route("/info", info);

export default app;
