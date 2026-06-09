import { workspaceApp } from "@front-api/middlewares/ctx";

import validate from "./validate";

// Mounted under /api/w/:wId/coupon.
const app = workspaceApp();

app.route("/validate", validate);

export default app;
