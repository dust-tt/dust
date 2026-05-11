import { Hono } from "hono";

import { workspaceAuth } from "../../middleware/workspace_auth";
import { spacesApp } from "./spaces";

// Mounted at /api/w/:wId. Every route below inherits workspaceAuth, which
// resolves the Authenticator and stashes it on the context.
export const workspaceApp = new Hono();

workspaceApp.use("*", workspaceAuth);

workspaceApp.route("/spaces", spacesApp);
