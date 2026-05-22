import { publicApiApp } from "@front-api/middleware/env";
import { publicApiAuth } from "@front-api/middleware/public_api_auth";

import featureFlags from "./feature_flags";
import spaces from "./spaces";
import verifiedDomains from "./verified_domains";

// Mounted at /api/v1/w/:wId. Every route below inherits publicApiAuth, which
// resolves the Authenticator from sandbox token, OAuth bearer, or API key
// and stashes it on the context.
const app = publicApiApp();

app.use("*", publicApiAuth);

app.route("/feature_flags", featureFlags);
app.route("/spaces", spaces);
app.route("/verified_domains", verifiedDomains);

export default app;
