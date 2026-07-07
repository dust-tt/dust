import { workspaceApp } from "@front-api/middlewares/ctx";

import redeem from "./redeem";
import redemptions from "./redemptions";
import validate from "./validate";

// Mounted under /api/w/:wId/coupon.
const app = workspaceApp();

app.route("/validate", validate);
app.route("/redeem", redeem);
app.route("/redemptions", redemptions);

export default app;
