import { Hono } from "hono";

import { assistantsApp } from "./assistants";
import { skillsApp } from "./skills";

// Mounted at /api/w/:wId/builder. workspaceAuth is applied by the parent
// workspace sub-app.
export const builderRootApp = new Hono();

builderRootApp.route("/assistants", assistantsApp);
builderRootApp.route("/skills", skillsApp);
