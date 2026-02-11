import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { isWebsite } from "@app/lib/data_sources";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err, Ok } from "@app/types/shared/result";

export const setWebcrawlerActions = createPlugin({
  manifest: {
    id: "set-webcrawler-actions",
    name: "Set Actions",
    description: "Set actions for Webcrawler",
    resourceTypes: ["data_sources"],
    args: {
      actions: {
        type: "text",
        label: "Actions",
        description: "",
      },
    },
  },
  isApplicableTo: (_, dataSource) => {
    if (!dataSource) {
      return false;
    }

    return isWebsite(dataSource);
  },
  execute: async (_, dataSource, args) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found"));
    }

    const { connectorId } = dataSource;
    if (!connectorId) {
      return new Err(new Error("No connector on data source"));
    }
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const cmdRes = await connectorsAPI.admin({
      majorCommand: "webcrawler",
      command: "set-actions",
      args: {
        connectorId: connectorId.toString(),
        actions: args.actions,
      },
    });
    if (cmdRes.isErr()) {
      return new Err(new Error(cmdRes.error.message));
    }

    return new Ok({
      display: "text",
      value: `Connector ${connectorId} actions have been updated`,
    });
  },
});
