import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types";
import { Err, Ok } from "@app/types/shared/result";

export const restrictedSpaceAgentsPlugin = createPlugin({
  manifest: {
    id: "restricted-space-agents",
    name: "Configure Restricted Space Agents",
    description:
      "Configure whether agents with access to data from restricted spaces can be invoked via Slack",
    resourceTypes: ["data_sources"],
    args: {
      action: {
        type: "enum",
        label: "Action",
        description:
          "Select whether to enable or disable restricted space agents for Slack",
        values: ["enable", "disable"],
      },
      confirm: {
        type: "boolean",
        label: "Confirm Action",
        description: "Confirm you want to proceed with this action",
      },
    },
  },
  isApplicableTo: (auth, resource) => {
    return resource?.connectorProvider === "slack";
  },
  execute: async (auth, dataSource, args) => {
    if (!dataSource) {
      return new Err(new Error("Cannot find data source."));
    }

    if (dataSource.connectorProvider !== "slack") {
      return new Err(
        new Error("This action is only available for Slack data sources.")
      );
    }

    const { action, confirm } = args;
    if (!confirm) {
      return new Err(
        new Error("Please confirm that you want to proceed with this action.")
      );
    }

    if (!["enable", "disable"].includes(action)) {
      return new Err(
        new Error("Invalid action. Must be either 'enable' or 'disable'.")
      );
    }

    if (!dataSource.connectorId) {
      return new Err(
        new Error("No Slack connector found for this data source.")
      );
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    // Set restricted space agents enabled/disabled according to action
    const res = await connectorsAPI.setConnectorConfig(
      dataSource.connectorId,
      "restrictedSpaceAgentsEnabled",
      (action === "enable").toString()
    );

    if (res.isErr()) {
      return new Err(new Error(res.error.message));
    }

    const actionText = action === "enable" ? "enabled" : "disabled";
    return new Ok({
      display: "text",
      value: `Restricted space agents have been ${actionText} on Slack for this workspace.`,
    });
  },
});
