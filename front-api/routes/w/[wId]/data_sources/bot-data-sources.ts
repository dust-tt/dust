import { Hono } from "hono";

import { DataSourceResource } from "@app/lib/resources/data_source_resource";

// Mounted at /api/w/:wId/data_sources/bot-data-sources.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return c.json(
      {
        error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `admins` for the current workspace can access this endpoint.",
        },
      },
      403
    );
  }

  const [
    [slackBotDataSource],
    [microsoftBotDataSource],
    [discordBotDataSource],
  ] = await Promise.all([
    DataSourceResource.listByConnectorProvider(auth, "slack_bot"),
    DataSourceResource.listByConnectorProvider(auth, "microsoft_bot"),
    DataSourceResource.listByConnectorProvider(auth, "discord_bot"),
  ]);

  return c.json({
    slackBotDataSource: slackBotDataSource?.toJSON() ?? null,
    microsoftBotDataSource: microsoftBotDataSource?.toJSON() ?? null,
    discordBotDataSource: discordBotDataSource?.toJSON() ?? null,
  });
});

export default app;
