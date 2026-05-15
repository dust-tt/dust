import { Hono } from "hono";

import { workspaceAuth } from "../../middleware/workspace_auth";
import { featureFlagsApp } from "./feature-flags";
import { spacesApp } from "./spaces";
import { trialMessageUsageApp } from "./trial-message-usage";

// Mounted at /api/w/:wId. Every route below inherits workspaceAuth, which
// resolves the Authenticator and stashes it on the context.
export const workspaceApp = new Hono();

workspaceApp.use("*", workspaceAuth);

workspaceApp.route("/feature-flags", featureFlagsApp);
workspaceApp.route("/spaces", spacesApp);
workspaceApp.route("/trial-message-usage", trialMessageUsageApp);
