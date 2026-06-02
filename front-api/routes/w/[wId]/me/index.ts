import { workspaceApp } from "@front-api/middlewares/ctx";

import approvals from "./approvals";
import pendingInvitations from "./pending-invitations";
import slackNotifications from "./slack-notifications";
import triggers from "./triggers";

// Mounted under /api/w/:wId/me.
const app = workspaceApp();

app.route("/approvals", approvals);
app.route("/pending-invitations", pendingInvitations);
app.route("/slack-notifications", slackNotifications);
app.route("/triggers", triggers);

export default app;
