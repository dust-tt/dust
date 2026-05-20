import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { Hono } from "hono";

export type GetSlackNotificationResponseBody = {
  canConfigure: boolean;
};

// Mounted at /api/w/:wId/me/slack-notifications.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  const featureFlags = await getFeatureFlags(auth);
  const isFeatureEnabled = featureFlags.includes(
    "conversations_slack_notifications"
  );

  if (!isFeatureEnabled) {
    const body: GetSlackNotificationResponseBody = { canConfigure: false };
    return c.json(body);
  }

  const slackBotConnections = await DataSourceResource.listByConnectorProvider(
    auth,
    "slack_bot"
  );

  const body: GetSlackNotificationResponseBody = {
    canConfigure: slackBotConnections.length > 0,
  };
  return c.json(body);
});

export default app;
