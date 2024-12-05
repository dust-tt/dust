import { makeScript } from "scripts/helpers";

import {
  fetchConfluenceConfigurationActivity,
  getConfluenceClient,
  getSpaceIdsToSyncActivity,
} from "@connectors/connectors/confluence/temporal/activities";
import {
  ExternalOAuthTokenError,
  ProviderWorkflowError,
} from "@connectors/lib/error";
import { ConnectorResource } from "@connectors/resources/connector_resource";

makeScript(
  {
    timeWindowMs: {
      type: "number",
      demandOption: false,
      default: 60 * 60 * 1000,
      description: "Size of the time window in ms.",
    },
    connectorsToSkip: {
      type: "array",
      demandOption: false,
      default: [],
      description: "IDs of the connectors to skip.",
    },
  },
  async ({ timeWindowMs, connectorsToSkip }) => {
    const connectors = await ConnectorResource.listByType("confluence", {});
    const skippedConnectorIdsAsStrings = connectorsToSkip.map(
      (id) => id.toString() // we can actually get numbers from the CLI
    );

    const startDate = new Date(Date.now() - timeWindowMs);

    for (const connector of connectors) {
      if (skippedConnectorIdsAsStrings.includes(connector.id.toString())) {
        console.log(`-- Skipping connector ${connector.id}`);
        continue;
      }
      console.log(`-- Checking connector ${connector.id}`);
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

      try {
        for (const spaceId of spaceIds) {
          const allPages: Awaited<
            ReturnType<typeof client.getPagesInSpace>
          >["pages"] = [];

          let cursor = null;
          let oldestPage;
          do {
            const { pages, nextPageCursor } = await client.getPagesInSpace(
              spaceId,
              "all",
              "-modified-date",
              cursor
            );
            oldestPage = pages[pages.length - 1];
            cursor = nextPageCursor;
            pages.forEach((page) => allPages.push(page));
          } while (
            oldestPage && // oldestPage is undefined if there are no pages
            new Date(oldestPage.version.createdAt) >= startDate
          );

          const recentlyModifiedPages = allPages.filter(
            (page) => new Date(page.version.createdAt) >= startDate
          );
          console.log(
            `${recentlyModifiedPages.length} pages out of ${allPages.length} modified in the last hour for space ${spaceId}`
          );
          connectorCount += recentlyModifiedPages.length;
        }
      } catch (e) {
        if (
          e instanceof ProviderWorkflowError ||
          e instanceof ExternalOAuthTokenError
        ) {
          console.error(
            `Error while checking connector ${connector.id}: ${e.message}`
          );
          continue;
        }
        throw e;
      }
      console.log(
        `${connectorCount} pages modified for connector ${connector.id}`
      );
    }
    console.log("Finished checking out all connectors");
  }
);
