import { unauthedApp } from "@front-api/middlewares/ctx";
import publicAuthActionApp from "./auth/[action]";
import publicMeApp from "./me";
import publicFramesTokenApp from "./public/frames/[token]";
import publicWorkspaceApp from "./w/[wId]";
import publicWorkspaceTriggersApp from "./w/[wId]/triggers";

const app = unauthedApp();

app.route("/auth/:action", publicAuthActionApp);
app.route("/me", publicMeApp);
app.route("/public/frames/:token", publicFramesTokenApp);
// Triggers is mounted before the workspace app so it does not inherit
// publicApiAuth (it uses its own URL secret-based authentication).
app.route("/w/:wId/triggers", publicWorkspaceTriggersApp);
app.route("/w/:wId", publicWorkspaceApp);

export default app;
