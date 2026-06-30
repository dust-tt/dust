import { workspaceApp } from "@front-api/middlewares/ctx";

import redeem from "./redeem";
import validate from "./validate";

// Mounted under /api/w/:wId/coupon.
const app = workspaceApp();

app.route("/validate", validate);
app.route("/redeem", redeem);

export default app;
