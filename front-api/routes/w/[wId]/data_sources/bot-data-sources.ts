import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { GetBotDataSourcesResponseBody } from "@app/types/api/data_sources/bot_data_sources";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/data_sources/bot-data-sources.
const app = workspaceApp();

/** @ignoreswagger */
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
