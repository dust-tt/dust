import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import type {
  IntercomCommandType,
  IntercomGetConversationsSlidingWindowResponseType,
} from "@app/types";
import { ConnectorsAPI, Err, Ok } from "@app/types";

export const intercomSetSlidingWindowPlugin = createPlugin({
  manifest: {
    id: "intercom-set-conversations-sliding-window",
    name: "Set Conversations Sliding Window",
    description:
      "Set the time window (in days) for syncing conversations from Intercom. Default is 180 days.",
    resourceTypes: ["data_sources"],
    args: {
      conversationsSlidingWindow: {
        type: "number",
        async: true,
        label: "Sliding Window (days)",
        description:
          "Number of days to look back for conversations. Must be 0 or greater.",
      },
    },
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }

    return resource.connectorProvider === "intercom";
  },
  populateAsyncArgs: async (auth, resource) => {
    if (!resource || !resource.connectorId) {
      return new Err(new Error("Data source not found."));
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const command: IntercomCommandType = {
      majorCommand: "intercom",
      command: "get-conversations-sliding-window",
      args: {
        connectorId: Number(resource.connectorId),
        force: undefined,
        conversationId: undefined,
        day: undefined,
        helpCenterId: undefined,
        conversationsSlidingWindow: undefined,
      },
    };

    const result = await connectorsAPI.admin(command);

    if (result.isErr()) {
      return new Err(
        new Error(`Failed to get current sliding window: ${result.error}`)
      );
    }

    const response =
      result.value as IntercomGetConversationsSlidingWindowResponseType;

    return new Ok({
      conversationsSlidingWindow: response.conversationsSlidingWindow,
    });
  },
  execute: async (auth, resource, args) => {
    const { conversationsSlidingWindow } = args;

    if (!resource) {
      return new Err(new Error("Data source not found."));
    }

    if (!resource.connectorId) {
      return new Err(new Error("No connector on datasource."));
    }

    if (conversationsSlidingWindow < 0) {
      return new Err(
        new Error("Sliding window must be 0 or a positive number.")
      );
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const command: IntercomCommandType = {
      majorCommand: "intercom",
      command: "set-conversations-sliding-window",
      args: {
        connectorId: Number(resource.connectorId),
        conversationsSlidingWindow,
        force: undefined,
        conversationId: undefined,
        day: undefined,
        helpCenterId: undefined,
      },
    };

    const result = await connectorsAPI.admin(command);

    if (result.isErr()) {
      return new Err(new Error(result.error.message));
    }

    return new Ok({
      display: "text",
      value: `Successfully set conversations sliding window to ${conversationsSlidingWindow} days.`,
    });
  },
});
