import { Hono } from "hono";

import { workspaceAuth } from "@front-api/middleware/workspace_auth";

import start from "./start";

// Mounted under /api/w/:wId/trial. All children opt out of canUseProduct.
const app = new Hono();

app.use("*", workspaceAuth({ doesNotRequireCanUseProduct: true }));

app.route("/start", start);

export default app;
