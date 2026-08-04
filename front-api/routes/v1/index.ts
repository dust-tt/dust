import { unauthedApp } from "@front-api/middlewares/ctx";
import publicAuthActionApp from "./auth/[action]";
import publicMeApp from "./me";
import publicBrandingApp from "./public/branding";
import publicFramesTokenApp from "./public/frames/[token]";
import publicWorkspaceApp from "./w/[wId]";
import publicWorkspaceSandboxApp from "./w/[wId]/sandbox";
import publicWorkspaceTriggersApp from "./w/[wId]/triggers";

const app = unauthedApp();

app.route("/auth/:action", publicAuthActionApp);
app.route("/me", publicMeApp);
app.route("/public/branding", publicBrandingApp);
app.route("/public/frames/:token", publicFramesTokenApp);
// Own-auth routes mounted BEFORE the authed workspace app (CODING_RULES [API4]):
// they must precede the catch-all sibling — Hono scans in registration order
// ([API1]). Posture locked by front-api/app.test.ts.
// Triggers uses its own URL secret-based authentication, not publicApiAuth.
app.route("/w/:wId/triggers", publicWorkspaceTriggersApp);
// Sandbox uses `sandboxAuth`, which accepts only sandbox tokens, not publicApiAuth.
app.route("/w/:wId/sandbox", publicWorkspaceSandboxApp);
app.route("/w/:wId", publicWorkspaceApp);

export default app;
