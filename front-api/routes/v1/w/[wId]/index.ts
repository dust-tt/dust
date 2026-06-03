import { publicApiApp } from "@front-api/middlewares/ctx";
import { publicApiAuth } from "@front-api/middlewares/public_api_auth";
import analytics from "./analytics";
import apps from "./apps";
import assistant from "./assistant";
import dataSourceViews from "./data_source_views";
import dataSources from "./data_sources";
import featureFlags from "./feature_flags";
import files from "./files";
import mcp from "./mcp";
import members from "./members";
import search from "./search";
import skills from "./skills";
import spaces from "./spaces";
import usage from "./usage";
import verifiedDomains from "./verified_domains";
import workspaceUsage from "./workspace-usage";

// Mounted at /api/v1/w/:wId. Every route below inherits publicApiAuth, which
// resolves the Authenticator from sandbox token, OAuth bearer, or API key
// and stashes it on the context.
const app = publicApiApp();

app.use("*", publicApiAuth);

app.route("/analytics", analytics);
app.route("/apps", apps);
app.route("/assistant", assistant);
app.route("/data_sources", dataSources);
app.route("/data_source_views", dataSourceViews);
app.route("/feature_flags", featureFlags);
app.route("/files", files);
app.route("/mcp", mcp);
app.route("/members", members);
app.route("/search", search);
app.route("/skills", skills);
app.route("/spaces", spaces);
app.route("/usage", usage);
app.route("/verified_domains", verifiedDomains);
app.route("/workspace-usage", workspaceUsage);

export default app;
