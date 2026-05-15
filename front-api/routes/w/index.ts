import { Hono } from "hono";

import { workspaceAuth } from "../../middleware/workspace_auth";
import { membersApp } from "./members";
import { providersApp } from "./providers";
import { spacesApp } from "./spaces";
import { verifyApp } from "./verify";

// Mounted at /api/w/:wId. Every route below inherits workspaceAuth, which
// resolves the Authenticator and stashes it on the context.
export const workspaceApp = new Hono();

workspaceApp.use("*", workspaceAuth);

workspaceApp.route("/members", membersApp);
workspaceApp.route("/providers", providersApp);
workspaceApp.route("/spaces", spacesApp);
workspaceApp.route("/verify", verifyApp);
