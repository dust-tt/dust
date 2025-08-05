import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import type { AdminCommandType } from "@app/types";
import { ConnectorsAPI, Err, Ok } from "@app/types";
export const slackAutoJoinPlugin = createPlugin({
  manifest: {
    id: "slack-autojoin-bot",
    name: "Run slack auto join",
    description: "Run auto-join based on the auto-read/join patterns",
    resourceTypes: ["data_sources"],
    args: {},
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }

    // Plugin is available for both slack and slack_bot providers.
    return ["slack", "slack_bot"].includes(resource.connectorProvider ?? "");
  },
  execute: async (auth, resource, args) => {
    const owner = auth.getNonNullableWorkspace();

    if (!resource) {
      return new Err(new Error("Data source not found."));
    }

    if (!resource.connectorProvider) {
      return new Err(new Error("Provider type is required"));
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const autoJoinCmd: AdminCommandType = {
      majorCommand: "slack",
      command: "auto-join-channels",
      args: {
        wId: owner.sId,
        providerType: resource.connectorProvider,
      },
    };

    const adminCommandRes = await connectorsAPI.admin(autoJoinCmd);
    if (adminCommandRes.isErr()) {
      return new Err(
        new Error(`Failed to autojoin: ${adminCommandRes.error.message}`)
      );
    }

    return new Ok({
      display: "text",
      value: `Channels joined.`,
    });
  },
});
