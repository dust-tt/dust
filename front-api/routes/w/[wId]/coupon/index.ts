import { Hono } from "hono";

import validate from "./validate";

// Mounted under /api/w/:wId/coupon.
const app = new Hono();

app.route("/validate", validate);

export default app;
