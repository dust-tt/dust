import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { GetSlackNotificationResponseBody } from "@app/types/api/me/slack_notifications";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/me/slack-notifications.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetSlackNotificationResponseBody> => {
  const auth = ctx.get("auth");

  const featureFlags = await getFeatureFlags(auth);
  const isFeatureEnabled = featureFlags.includes(
    "conversations_slack_notifications"
  );

  if (!isFeatureEnabled) {
    return ctx.json({ canConfigure: false });
  }

  const slackBotConnections = await DataSourceResource.listByConnectorProvider(
    auth,
    "slack_bot"
  );

  return ctx.json({
    canConfigure: slackBotConnections.length > 0,
  });
});

export default app;
