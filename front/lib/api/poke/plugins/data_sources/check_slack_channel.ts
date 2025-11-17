import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import type { AdminCommandType } from "@app/types";
import { ConnectorsAPI, Err, Ok } from "@app/types";

export const checkSlackChannelPlugin = createPlugin({
  manifest: {
    id: "check-slack-channel",
    name: "Check Slack Channel",
    description:
      "Check if a Slack channel exists and is accessible by the connector",
    resourceTypes: ["data_sources"],
    args: {
      channelId: {
        type: "string",
        label: "Channel ID",
        description: "Slack channel ID to check (e.g., C1234567890)",
      },
    },
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }

    return resource.connectorProvider === "slack";
  },
  execute: async (auth, dataSource, args) => {
    const owner = auth.getNonNullableWorkspace();
    const { channelId } = args;

    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    if (dataSource.connectorProvider !== "slack") {
      return new Err(new Error("Data source is not a Slack connector."));
    }

    if (!channelId.trim()) {
      return new Err(new Error("Channel ID is required"));
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const checkChannelCmd: AdminCommandType = {
      majorCommand: "slack",
      command: "check-channel",
      args: {
        wId: owner.sId,
        channelId: channelId.trim(),
      },
    };

    const result = await connectorsAPI.admin(checkChannelCmd);
    if (result.isErr()) {
      return new Err(
        new Error(`Failed to check channel: ${result.error.message}`)
      );
    }

    return new Ok({
      display: "text",
      value: `Channel ${channelId} exists and is accessible by the connector`,
    });
  },
});
