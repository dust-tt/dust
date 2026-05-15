import { Hono } from "hono";

import { publicApiAuth } from "../../../middleware/public_api_auth";
import { publicFeatureFlagsApp } from "./feature_flags";
import { publicSpacesApp } from "./spaces";

// Mounted at /api/v1/w/:wId. Every route below inherits publicApiAuth, which
// resolves the Authenticator from sandbox token, OAuth bearer, or API key
// and stashes it on the context.
export const publicWorkspaceApp = new Hono();

publicWorkspaceApp.use("*", publicApiAuth);

publicWorkspaceApp.route("/feature_flags", publicFeatureFlagsApp);
publicWorkspaceApp.route("/spaces", publicSpacesApp);
