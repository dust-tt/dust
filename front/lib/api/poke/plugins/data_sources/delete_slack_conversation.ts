import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import type { AdminCommandType } from "@app/types/connectors/admin/cli";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err, Ok } from "@app/types/shared/result";

export const deleteSlackConversationPlugin = createPlugin({
  manifest: {
    id: "delete-slack-conversation",
    name: "Delete Slack Conversation",
    description:
      "Delete a Slack conversation thread from the data source. This removes the thread document from both the core data source and the connectors database.",
    warning:
      "The thread must be first deleted from the customer's Slack, otherwise it will get re-indexed on next full sync.",
    resourceTypes: ["data_sources"],
    args: {
      channelId: {
        type: "string",
        label: "Channel ID",
        description: "Slack channel ID (e.g., CXXXXXXXXXX)",
      },
      threadTs: {
        type: "string",
        label: "Thread Timestamp",
        description:
          "Timestamp of the thread to delete (e.g., 1234567890.123456)",
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
    const { channelId, threadTs } = args;

    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    if (dataSource.connectorProvider !== "slack") {
      return new Err(new Error("Data source is not a Slack connector."));
    }

    if (!channelId.trim()) {
      return new Err(new Error("Channel ID is required."));
    }

    if (!threadTs.trim()) {
      return new Err(new Error("Thread Timestamp is required."));
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const deleteConversationCmd: AdminCommandType = {
      majorCommand: "slack",
      command: "delete-conversation",
      args: {
        wId: owner.sId,
        channelId: channelId.trim(),
        threadTs: threadTs.trim(),
      },
    };

    const result = await connectorsAPI.admin(deleteConversationCmd);
    if (result.isErr()) {
      return new Err(
        new Error(`Failed to delete conversation: ${result.error.message}`)
      );
    }

    return new Ok({
      display: "text",
      value: `Conversation thread ${threadTs} in channel ${channelId} has been deleted from the data source.`,
    });
  },
});
