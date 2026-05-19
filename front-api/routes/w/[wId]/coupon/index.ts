import { Hono } from "hono";

import { workspaceAuth } from "@front-api/middleware/workspace_auth";

import validate from "./validate";

// Mounted under /api/w/:wId/coupon. All children opt out of canUseProduct.
const app = new Hono();

app.use("*", workspaceAuth({ doesNotRequireCanUseProduct: true }));

app.route("/validate", validate);

export default app;
