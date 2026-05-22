import { workspaceApp } from "@front-api/middleware/env";

import validate from "./validate";

// Mounted under /api/w/:wId/coupon.
const app = workspaceApp();

app.route("/validate", validate);

export default app;
