import { workspaceApp } from "@front-api/middlewares/ctx";

import { createPersonalConsumptionRoutes } from "../analytics/consumption";
import approvals from "./approvals";
import memory from "./memory";
import pendingInvitations from "./pending-invitations";
import slackNotifications from "./slack-notifications";
import triggers from "./triggers";

// Mounted under /api/w/:wId/me.
const app = workspaceApp();
const consumption = createPersonalConsumptionRoutes();

app.route("/analytics/consumption", consumption);
app.route("/approvals", approvals);
app.route("/memory", memory);
app.route("/pending-invitations", pendingInvitations);
app.route("/slack-notifications", slackNotifications);
app.route("/triggers", triggers);

export default app;
