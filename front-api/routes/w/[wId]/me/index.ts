import { Hono } from "hono";

import { workspaceAuth } from "@front-api/middleware/workspace_auth";

import pendingInvitations from "./pending-invitations";
import slackNotifications from "./slack-notifications";
import triggers from "./triggers";

// Mounted under /api/w/:wId/me.
const app = new Hono();

app.use("*", workspaceAuth());

app.route("/pending-invitations", pendingInvitations);
app.route("/slack-notifications", slackNotifications);
app.route("/triggers", triggers);

export default app;
