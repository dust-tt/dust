import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { AdminCommandType } from "@app/types";
import { ConnectorsAPI, Err, Ok } from "@app/types";

export const confluenceSkipPagesPlugin = createPlugin({
  manifest: {
    id: "confluence-skip-pages",
    name: "Skip Confluence Pages",
    description:
      "Skip Confluence pages that are not indexable (comma separated list of page IDs)",
    resourceTypes: ["data_sources"],
    args: {
      pageIds: {
        type: "text",
        label: "Page IDs",
        description: "The Confluence page IDs to skip (comma separated list)",
      },
    },
  },
  isApplicableTo: (auth, dataSource) => {
    if (!dataSource) {
      return false;
    }

    return dataSource.connectorProvider === "confluence";
  },
  execute: async (auth, dataSource, args) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    const { connectorId } = dataSource;
    if (!connectorId) {
      return new Err(new Error("No connector on datasource."));
    }

    const pageIds = args.pageIds.split(",").map((id) => id.trim());

    // Validate page IDs.
    if (pageIds.length === 0) {
      return new Err(new Error("No page IDs provided."));
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const results = await concurrentExecutor(
      pageIds,
      async (pageId) => {
        const skipPageCommand: AdminCommandType = {
          majorCommand: "confluence",
          command: "skip-page",
          args: {
            connectorId: connectorId.toString(),
            pageId: pageId,
          },
        };

        return connectorsAPI.admin(skipPageCommand);
      },
      { concurrency: 10 }
    );

    const errors = results
      .filter((result) => result.isErr())
      .map((result) => result.error.message);

    if (errors.length > 0) {
      return new Err(new Error(errors.join(", ")));
    }

    return new Ok({
      display: "text",
      value: `Skipped ${pageIds.length} pages.`,
    });
  },
});
