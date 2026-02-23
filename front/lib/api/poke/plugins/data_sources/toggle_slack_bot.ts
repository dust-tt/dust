import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

export const toggleSlackBotPlugin = createPlugin({
  manifest: {
    id: "toggle-slack-bot",
    name: "Toggle Slack Bot",
    description: "Enable or disable the Slack bot",
    resourceTypes: ["data_sources"],
    args: {
      enabled: {
        type: "boolean",
        async: true,
        label: "Enabled",
        description: "Enable or disable the Slack bot",
      },
    },
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }

    // Plugin is available for both slack and slack_bot providers.
    return ["slack", "slack_bot"].includes(resource.connectorProvider ?? "");
  },
  populateAsyncArgs: async (auth, resource) => {
    if (!resource || !resource.connectorId) {
      return new Err(new Error("Data source not found."));
    }

    const connectorAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const connectorConfig = await connectorAPI.getConnectorConfig(
      resource.connectorId,
      "botEnabled"
    );

    if (connectorConfig.isErr()) {
      return new Err(
        new Error(`Failed to get connector config: ${connectorConfig.error}`)
      );
    }

    return new Ok({
      enabled: connectorConfig.value.configValue === "true",
    });
  },
  execute: async (auth, resource, args) => {
    const { enabled } = args;

    assert(resource, "Resource is required");
    assert(resource.connectorId, "Connector ID is required");

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const connectorRes = await connectorsAPI.setConnectorConfig(
      resource.connectorId,
      "botEnabled",
      enabled ? "true" : "false"
    );

    if (connectorRes.isErr()) {
      return new Err(
        new Error(`Failed to set connector config: ${connectorRes.error}`)
      );
    }

    return new Ok({
      display: "text",
      value: `Successfully ${enabled ? "enabled" : "disabled"} Slack bot`,
    });
  },
});
