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
      description: "Number of connectors to process concurrently",
    },
  },
  async ({ timeWindowMs }) => {
    const connectors = await ConnectorResource.listByType("confluence", {});

    for (const connector of connectors) {
      console.log(`Checking connector ${connector.id}`);

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
        const { pages } = await client.getPagesInSpace(
          spaceId,
          "all",
          "-modified-date"
        );
        const recentlyModifiedPages = pages.filter(
          (page) => new Date(page.version.createdAt) >= new Date(timeWindowMs)
        );
        console.log(
          `${pages.length} pages out of ${recentlyModifiedPages.length} modified in the last hour for space ${spaceId}`
        );
      }
    }
    console.log("Finished checking out all connectors");
  }
);
