import { Hono } from "hono";

import archive from "./archive";
import redemptions from "./redemptions";

// Mounted at /api/poke/coupons/:couponId.
const app = new Hono();

app.route("/archive", archive);
app.route("/redemptions", redemptions);

export default app;
