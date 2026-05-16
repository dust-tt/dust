import { Hono } from "hono";

import { workspaceAuth } from "../../middleware/workspace_auth";
import { membersApp } from "./members";
import { modelsApp } from "./models";
import { providersApp } from "./providers";
import { provisioningStatusApp } from "./provisioning-status";
import { spacesApp } from "./spaces";
import { verifiedDomainsApp } from "./verified-domains";
import { verifyApp } from "./verify";
import { welcomeApp } from "./welcome";

// Mounted at /api/w/:wId. Every route below inherits workspaceAuth, which
// resolves the Authenticator and stashes it on the context.
export const workspaceApp = new Hono();

workspaceApp.use("*", workspaceAuth);

workspaceApp.route("/members", membersApp);
workspaceApp.route("/models", modelsApp);
workspaceApp.route("/providers", providersApp);
workspaceApp.route("/provisioning-status", provisioningStatusApp);
workspaceApp.route("/spaces", spacesApp);
workspaceApp.route("/verified-domains", verifiedDomainsApp);
workspaceApp.route("/verify", verifyApp);
workspaceApp.route("/welcome", welcomeApp);
