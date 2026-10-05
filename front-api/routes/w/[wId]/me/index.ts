import { workspaceApp } from "@front-api/middlewares/ctx";

import agentMemories from "./agent-memories";
import analytics from "./analytics";
import approvals from "./approvals";
import memory from "./memory";
import pendingInvitations from "./pending-invitations";
import profile from "./profile";
import slackNotifications from "./slack-notifications";
import triggers from "./triggers";
import wakeups from "./wakeups";

// Mounted under /api/w/:wId/me.
const app = workspaceApp();

app.route("/agent-memories", agentMemories);
app.route("/analytics", analytics);
app.route("/approvals", approvals);
app.route("/memory", memory);
app.route("/pending-invitations", pendingInvitations);
app.route("/profile", profile);
app.route("/slack-notifications", slackNotifications);
app.route("/triggers", triggers);
app.route("/wakeups", wakeups);

export default app;
