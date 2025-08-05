import { isLeft } from "fp-ts/lib/Either";

import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import type { AdminCommandType } from "@app/types";
import { ConnectorsAPI, Err, Ok, SlackJoinResponseSchema } from "@app/types";

export const slackRunAutoJoinPlugin = createPlugin({
  manifest: {
    id: "slack-run-auto-join",
    name: "Run slack auto-join",
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
  execute: async (auth, resource) => {
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
      command: "run-auto-join",
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

    const decoded = SlackJoinResponseSchema.decode(adminCommandRes.value);
    if (isLeft(decoded)) {
      return new Err(new Error("Failed to decode response"));
    }

    const { total, processed } = decoded.right;

    return new Ok({
      display: "text",
      value: `${processed} channels joined out of ${total}.`,
    });
  },
});
