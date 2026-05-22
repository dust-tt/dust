import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { DataSourceType } from "@app/types/data_source";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

export type GetBotDataSourcesResponseBody = {
  slackBotDataSource: DataSourceType | null;
  microsoftBotDataSource: DataSourceType | null;
  discordBotDataSource: DataSourceType | null;
};

// Mounted at /api/w/:wId/data_sources/bot-data-sources.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetBotDataSourcesResponseBody> => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
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

  return ctx.json({
    slackBotDataSource: slackBotDataSource?.toJSON() ?? null,
    microsoftBotDataSource: microsoftBotDataSource?.toJSON() ?? null,
    discordBotDataSource: discordBotDataSource?.toJSON() ?? null,
  });
});

export default app;
