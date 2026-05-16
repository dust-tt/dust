import { Hono } from "hono";

import { builderApp } from "./builder";

// Mounted at /api/w/:wId/assistant. workspaceAuth is applied by the parent
// workspace sub-app.
export const assistantApp = new Hono();

assistantApp.route("/builder", builderApp);
