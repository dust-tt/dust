import { workspaceAuth } from "@front-api/middleware/workspace_auth";
import { Hono } from "hono";

import analytics from "./analytics";
import assistant from "./assistant";
import auditLogs from "./audit-logs";
import authContext from "./auth-context";
import builder from "./builder";
import coupon from "./coupon";
import credits from "./credits";
import dataSourceViews from "./data_source_views";
import dataSources from "./data_sources";
import domains from "./domains";
import dsync from "./dsync";
import extension from "./extension";
import featureFlags from "./feature-flags";
import files from "./files";
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
import sso from "./sso";
import subscriptions from "./subscriptions";
import trial from "./trial";
import trialMessageUsage from "./trial-message-usage";
import verifiedDomains from "./verified-domains";
import verify from "./verify";
import welcome from "./welcome";
import workspaceAnalytics from "./workspace-analytics";
import workspaceUsage from "./workspace-usage";

// Mounted at /api/w/:wId.
const app = new Hono();

// `auth-context` runs without `workspaceAuth` because it needs to handle
// the missing-workspace case (cross-region redirect). It owns its own
// session-based auth flow internally. Must be mounted before the
// `workspaceAuth` middleware below.
// TODO: review this
app.route("/auth-context", authContext);

// Every route below inherits workspaceAuth, which resolves the Authenticator
// and stashes it on the context.
app.use("*", workspaceAuth);

app.route("/analytics", analytics);
app.route("/assistant", assistant);
app.route("/audit-logs", auditLogs);
app.route("/builder", builder);
app.route("/coupon", coupon);
app.route("/credits", credits);
app.route("/data_source_views", dataSourceViews);
app.route("/data_sources", dataSources);
app.route("/domains", domains);
app.route("/dsync", dsync);
app.route("/extension", extension);
app.route("/feature-flags", featureFlags);
app.route("/files", files);
app.route("/groups", groups);
app.route("/mcp", mcp);
app.route("/me", me);
app.route("/members", members);
app.route("/models", models);
app.route("/providers", providers);
app.route("/provisioning-status", provisioningStatus);
app.route("/seats", seats);
app.route("/skills", skills);
app.route("/sso", sso);
app.route("/spaces", spaces);
app.route("/subscriptions", subscriptions);
app.route("/trial", trial);
app.route("/trial-message-usage", trialMessageUsage);
app.route("/verified-domains", verifiedDomains);
app.route("/verify", verify);
app.route("/welcome", welcome);
app.route("/workspace-analytics", workspaceAnalytics);
app.route("/workspace-usage", workspaceUsage);

export default app;
