import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { isWebsite } from "@app/lib/data_sources";
import logger from "@app/logger/logger";
import type { AdminCommandType } from "@app/types";
import {
  ConnectorsAPI,
  CrawlingFrequencies,
  Err,
  FREQUENCY_DISPLAY_TEXT,
  mapToEnumValues,
  Ok,
} from "@app/types";

export const changeWebcrawlerFrequency = createPlugin({
  manifest: {
    id: "change-webcrawler-frequency",
    name: "Change Webcrawler Frequency",
    description: "Update the webcrawler crawlFrequency",
    resourceTypes: ["data_sources"],
    args: {
      crawlFrequency: {
        type: "enum",
        label: "Crawl Frequency",
        description: "Crawler Frequency",
        values: mapToEnumValues(CrawlingFrequencies, (freq) => ({
          label: FREQUENCY_DISPLAY_TEXT[freq],
          value: freq,
        })),
        multiple: false,
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

    const setCrawlFrequency: AdminCommandType = {
      majorCommand: "webcrawler",
      command: "update-frequency",
      args: {
        connectorId: connectorId.toString(),
        crawlFrequency: args.crawlFrequency[0],
      },
    };

    const cmdRes = await connectorsAPI.admin(setCrawlFrequency);
    if (cmdRes.isErr()) {
      return new Err(new Error(cmdRes.error.message));
    }

    return new Ok({
      display: "text",
      value: `Connector ${connectorId} crawl frequency set to ${args.crawlFrequency}`,
    });
  },
});
