import { makeScript } from "scripts/helpers";

import {
  fetchConfluenceConfigurationActivity,
  getConfluenceClient,
  getSpaceIdsToSyncActivity,
} from "@connectors/connectors/confluence/temporal/activities";
import { ConnectorResource } from "@connectors/resources/connector_resource";

makeScript(
  {
    timeWindowMs: {
      type: "number",
      demandOption: false,
      default: 60 * 60 * 1000,
      description: "Size of the time window in ms.",
    },
  },
  async ({ timeWindowMs }) => {
    const connectors = await ConnectorResource.listByType("confluence", {});

    const startDate = new Date(Date.now() - timeWindowMs);

    for (const connector of connectors) {
      console.log(`\n -- Checking connector ${connector.id}`);
      let connectorCount = 0;

      const confluenceConfig = await fetchConfluenceConfigurationActivity(
        connector.id
      );
      const { cloudId } = confluenceConfig;

      const client = await getConfluenceClient({
        cloudId,
        connectorId: connector.id,
      });

      const spaceIds = await getSpaceIdsToSyncActivity(connector.id);

      for (const spaceId of spaceIds) {
        const allPages: ({
          version: { number: number; createdAt: string };
        } & { [p: string]: unknown })[] = [];
        let cursor = null;
        for (;;) {
          const { pages, nextPageCursor } = await client.getPagesInSpace(
            spaceId,
            "all",
            "-modified-date",
            cursor
          );
          if (pages.length === 0) {
            break;
          }
          const oldestPage = pages[pages.length - 1];
          if (
            oldestPage &&
            new Date(oldestPage.version.createdAt) < startDate
          ) {
            break;
          }

          cursor = nextPageCursor;
          pages.forEach((page) => allPages.push(page));
        }

        const recentlyModifiedPages = allPages.filter(
          (page) =>
            new Date(page.version.createdAt) >=
            new Date(Date.now() - timeWindowMs)
        );
        console.log(
          `${allPages.length} pages out of ${recentlyModifiedPages.length} modified in the last hour for space ${spaceId}`
        );
        connectorCount += recentlyModifiedPages.length;
      }
      console.log(
        `${connectorCount} pages modified for connector ${connector.id}`
      );
    }
    console.log("Finished checking out all connectors");
  }
);
