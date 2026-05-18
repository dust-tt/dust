import { Hono } from "hono";

import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";

// Mounted at /api/w/:wId/assistant/builder/slack/channels_linked_with_agent.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isBuilder()) {
    return c.json(
      {
        error: {
          type: "data_source_auth_error",
          message:
            "Only the users that are `builders` for the current workspace can modify linked Slack channels.",
        },
      },
      403
    );
  }

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
    return c.json({ provider, slackChannels: [], slackDataSource: undefined });
  }

  if (!dataSource.connectorId) {
    return c.json(
      {
        error: {
          type: "data_source_not_managed",
          message: "The data source you requested is not managed.",
        },
      },
      400
    );
  }

  if (
    !dataSource.connectorProvider ||
    (dataSource.connectorProvider !== "slack_bot" &&
      dataSource.connectorProvider !== "slack")
  ) {
    return c.json(
      {
        error: {
          type: "data_source_not_managed",
          message:
            "The data source you requested is not managed by a slack connector.",
        },
      },
      400
    );
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
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message:
            "An error occurred while fetching the linked Slack channels.",
        },
      },
      500
    );
  }

  return c.json({
    provider,
    slackChannels: linkedSlackChannelsRes.value.slackChannels,
    slackDataSource: dataSource.toJSON(),
  });
});

export default app;
