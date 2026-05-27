import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { DataSourceType } from "@app/types/data_source";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_is_admin";
import type { HandlerResult } from "@front-api/middlewares/utils";

export type GetBotDataSourcesResponseBody = {
  slackBotDataSource: DataSourceType | null;
  microsoftBotDataSource: DataSourceType | null;
  discordBotDataSource: DataSourceType | null;
};

// Mounted at /api/w/:wId/data_sources/bot-data-sources.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetBotDataSourcesResponseBody> => {
    const auth = ctx.get("auth");

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
  }
);

export default app;
