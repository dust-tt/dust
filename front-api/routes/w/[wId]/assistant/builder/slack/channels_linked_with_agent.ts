import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { ConnectorProvider, DataSourceType } from "@app/types/data_source";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsBuilder } from "@front-api/middlewares/ensure_is_builder";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

export type GetSlackChannelsLinkedWithAgentResponseBody = {
  provider: Extract<ConnectorProvider, "slack" | "slack_bot">;
  slackChannels: {
    slackChannelId: string;
    slackChannelName: string;
    agentConfigurationId: string;
    autoRespondWithoutMention: boolean;
  }[];
  slackDataSource?: DataSourceType;
};

// Mounted at /api/w/:wId/assistant/builder/slack/channels_linked_with_agent.
const app = workspaceApp();

app.get(
  "/",
  ensureIsBuilder(),
  async (ctx): HandlerResult<GetSlackChannelsLinkedWithAgentResponseBody> => {
    const auth = ctx.get("auth");

    const [[dataSourceSlack], [dataSourceSlackBot]] = await Promise.all([
      DataSourceResource.listByConnectorProvider(auth, "slack"),
      DataSourceResource.listByConnectorProvider(auth, "slack_bot"),
    ]);

    let isSlackBotEnabled = false;
    if (dataSourceSlackBot && dataSourceSlackBot.connectorId) {
      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );
      const configRes = await connectorsAPI.getConnectorConfig(
        dataSourceSlackBot.connectorId,
        "botEnabled"
      );
      if (configRes.isOk()) {
        isSlackBotEnabled = configRes.value.configValue === "true";
      }
    }

    const provider = isSlackBotEnabled ? "slack_bot" : "slack";
    const dataSource = isSlackBotEnabled ? dataSourceSlackBot : dataSourceSlack;

    if (!dataSource) {
      return ctx.json({
        provider,
        slackChannels: [],
        slackDataSource: undefined,
      });
    }

    if (!dataSource.connectorId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "data_source_not_managed",
          message: "The data source you requested is not managed.",
        },
      });
    }

    if (
      !dataSource.connectorProvider ||
      (dataSource.connectorProvider !== "slack_bot" &&
        dataSource.connectorProvider !== "slack")
    ) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "data_source_not_managed",
          message:
            "The data source you requested is not managed by a slack connector.",
        },
      });
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const linkedSlackChannelsRes =
      await connectorsAPI.getSlackChannelsLinkedWithAgent({
        connectorId: dataSource.connectorId,
      });

    if (linkedSlackChannelsRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message:
            "An error occurred while fetching the linked Slack channels.",
        },
      });
    }

    return ctx.json({
      provider,
      slackChannels: linkedSlackChannelsRes.value.slackChannels,
      slackDataSource: dataSource.toJSON(),
    });
  }
);

export default app;
