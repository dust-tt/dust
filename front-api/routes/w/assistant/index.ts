import { Hono } from "hono";

import { builderApp } from "./builder";
import { mentionsApp } from "./mentions";
import { skillsApp } from "./skills";

// Mounted at /api/w/:wId/assistant. workspaceAuth is applied by the parent
// workspace sub-app.
export const assistantApp = new Hono();

assistantApp.route("/builder", builderApp);
assistantApp.route("/mentions", mentionsApp);
assistantApp.route("/skills", skillsApp);
