import { workspaceAuth } from "@front-api/middleware/workspace_auth";
import { Hono } from "hono";

import analytics from "./analytics";
import assistant from "./assistant";
import builder from "./builder";
import coupon from "./coupon";
import credits from "./credits";
import dataSourceViews from "./data_source_views";
import dataSources from "./data_sources";
import extension from "./extension";
import featureFlags from "./feature-flags";
import groups from "./groups";
import mcp from "./mcp";
import me from "./me";
import members from "./members";
import models from "./models";
import providers from "./providers";
import provisioningStatus from "./provisioning-status";
import seats from "./seats";
import skills from "./skills";
import spaces from "./spaces";
import subscriptions from "./subscriptions";
import trial from "./trial";
import trialMessageUsage from "./trial-message-usage";
import verifiedDomains from "./verified-domains";
import verify from "./verify";
import welcome from "./welcome";

// Mounted at /api/w/:wId. Every route below inherits workspaceAuth, which
// resolves the Authenticator and stashes it on the context.
const app = new Hono();

app.use("*", workspaceAuth);

app.route("/analytics", analytics);
app.route("/assistant", assistant);
app.route("/builder", builder);
app.route("/coupon", coupon);
app.route("/credits", credits);
app.route("/data_source_views", dataSourceViews);
app.route("/data_sources", dataSources);
app.route("/extension", extension);
app.route("/feature-flags", featureFlags);
app.route("/groups", groups);
app.route("/mcp", mcp);
app.route("/me", me);
app.route("/members", members);
app.route("/models", models);
app.route("/providers", providers);
app.route("/provisioning-status", provisioningStatus);
app.route("/seats", seats);
app.route("/skills", skills);
app.route("/spaces", spaces);
app.route("/subscriptions", subscriptions);
app.route("/trial", trial);
app.route("/trial-message-usage", trialMessageUsage);
app.route("/verified-domains", verifiedDomains);
app.route("/verify", verify);
app.route("/welcome", welcome);

export default app;
