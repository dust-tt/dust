import { Hono } from "hono";

import { workspaceAuth } from "@front-api/middleware/workspace_auth";

import assistant from "./assistant";
import builder from "./builder";
import featureFlags from "./feature-flags";
import mcp from "./mcp";
import members from "./members";
import models from "./models";
import providers from "./providers";
import provisioningStatus from "./provisioning-status";
import spaces from "./spaces";
import trialMessageUsage from "./trial-message-usage";
import verifiedDomains from "./verified-domains";
import verify from "./verify";
import welcome from "./welcome";

// Mounted at /api/w/:wId. Every route below inherits workspaceAuth, which
// resolves the Authenticator and stashes it on the context.
const app = new Hono();

app.use("*", workspaceAuth);

app.route("/assistant", assistant);
app.route("/builder", builder);
app.route("/feature-flags", featureFlags);
app.route("/mcp", mcp);
app.route("/members", members);
app.route("/models", models);
app.route("/providers", providers);
app.route("/provisioning-status", provisioningStatus);
app.route("/spaces", spaces);
app.route("/trial-message-usage", trialMessageUsage);
app.route("/verified-domains", verifiedDomains);
app.route("/verify", verify);
app.route("/welcome", welcome);

export default app;
