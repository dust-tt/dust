import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import type { AdminCommandType } from "@app/types";
import { ConnectorsAPI, Err, Ok } from "@app/types";

export const skipSlackChannelPlugin = createPlugin({
  manifest: {
    id: "skip-slack-channel",
    name: "Skip Slack Channel",
    description: "Skip syncing a Slack channel and mark it with a reason",
    resourceTypes: ["data_sources"],
    args: {
      channelId: {
        type: "string",
        label: "Channel ID",
        description: "Slack channel ID to skip (e.g., C1234567890)",
      },
      skipReason: {
        type: "string",
        label: "Skip Reason",
        description: "Reason for skipping this channel",
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
    const { channelId, skipReason } = args;

    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    if (dataSource.connectorProvider !== "slack") {
      return new Err(new Error("Data source is not a Slack connector."));
    }

    if (!channelId.trim() || !skipReason.trim()) {
      return new Err(new Error("Channel ID and skip reason are required"));
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const skipChannelCmd: AdminCommandType = {
      majorCommand: "slack",
      command: "skip-channel",
      args: {
        wId: owner.sId,
        channelId: channelId.trim(),
        skipReason: skipReason.trim(),
      },
    };

    const result = await connectorsAPI.admin(skipChannelCmd);
    if (result.isErr()) {
      return new Err(
        new Error(`Failed to skip channel: ${result.error.message}`)
      );
    }

    return new Ok({
      display: "text",
      value: `Channel ${channelId} has been skipped. Reason: ${skipReason}`,
    });
  },
});
