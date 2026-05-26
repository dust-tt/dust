import { publicApiApp } from "@front-api/middlewares/ctx";
import { publicApiAuth } from "@front-api/middlewares/public_api_auth";
import dataSourceViews from "./data_source_views";
import dataSources from "./data_sources";
import featureFlags from "./feature_flags";
import spaces from "./spaces";
import verifiedDomains from "./verified_domains";

// Mounted at /api/v1/w/:wId. Every route below inherits publicApiAuth, which
// resolves the Authenticator from sandbox token, OAuth bearer, or API key
// and stashes it on the context.
const app = publicApiApp();

app.use("*", publicApiAuth);

app.route("/data_sources", dataSources);
app.route("/data_source_views", dataSourceViews);
app.route("/feature_flags", featureFlags);
app.route("/spaces", spaces);
app.route("/verified_domains", verifiedDomains);

export default app;
