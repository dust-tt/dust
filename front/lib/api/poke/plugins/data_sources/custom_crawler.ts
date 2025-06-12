import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import { ConnectorsAPI, Err, Ok } from "@app/types";

export const customCrawlerPlugin = createPlugin({
  manifest: {
    id: "custom-crawler",
    name: "Custom Crawler",
    description: "Set up a custom crawler for the webcrawler data source",
    resourceTypes: ["data_sources"],
    args: {
      crawler: {
        type: "enum",
        label: "Crawler",
        description: "Select a crawler",
        values: [
          { label: "Firecrawl", value: "firecrawl" },
          { label: "Default", value: "default" },
        ],
      },
    },
  },
  isApplicableTo: (_, dataSource) => {
    if (!dataSource) {
      return false;
    }

    return dataSource.connectorProvider === "webcrawler";
  },
  execute: async (_, dataSource, args) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found"));
    }

    const { connectorId } = dataSource;
    if (!connectorId) {
      return new Err(new Error("No connector on datasource"));
    }

    const connectorsApi = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const res = await connectorsApi.admin({
      majorCommand: "webcrawler",
      command: "update-crawler",
      args: {
        connectorId,
        customCrawler: args.crawler,
      },
    });

    if (res.isErr()) {
      return new Err(new Error(res.error.message));
    }

    return new Ok({
      display: "text",
      value: "webcrawler updated",
    });
  },
});
