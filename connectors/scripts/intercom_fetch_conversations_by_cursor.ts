import { makeScript } from "scripts/helpers";

import { getIntercomAccessToken } from "@connectors/connectors/intercom/lib/intercom_access_token";
import { fetchIntercomConversations } from "@connectors/connectors/intercom/lib/intercom_api";
import { IntercomWorkspaceModel } from "@connectors/lib/models/intercom";
import { ConnectorResource } from "@connectors/resources/connector_resource";

makeScript(
  {
    connectorId: {
      alias: "c",
      type: "number",
      demandOption: true,
      describe: "The Intercom connector ID",
    },
    cursor: {
      type: "string",
      demandOption: true,
      describe: "The cursor to start fetching from",
    },
    pageSize: {
      alias: "p",
      type: "number",
      default: 50,
      describe: "Number of conversations per page (default: 50)",
    },
    maxPages: {
      alias: "m",
      type: "number",
      default: 1,
      describe: "Maximum number of pages to fetch (default: 1)",
    },
  },
  async (argv, logger) => {
    const { connectorId, cursor, pageSize, maxPages } = argv;

    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }
    if (connector.type !== "intercom") {
      throw new Error(`Connector ${connectorId} is not an Intercom connector`);
    }

    const accessToken = await getIntercomAccessToken(connector.connectionId);

    const workspace = await IntercomWorkspaceModel.findOne({
      where: { connectorId: connector.id },
    });

    if (!workspace) {
      throw new Error(`No workspace found for connector ${connector.id}`);
    }

    logger.info(
      {
        connectorId,
        cursor,
        pageSize,
        maxPages,
        slidingWindow: workspace.conversationsSlidingWindow,
      },
      "Starting conversation fetch"
    );

    let currentCursor: string | null = cursor;
    let pagesProcessed = 0;
    let totalFetched = 0;
    const conversationIds: string[] = [];

    while (currentCursor && pagesProcessed < maxPages) {
      const response = await fetchIntercomConversations({
        accessToken,
        slidingWindow: workspace.conversationsSlidingWindow,
        cursor: currentCursor,
        pageSize,
      });

      pagesProcessed++;

      if (response.conversations.length === 0) {
        logger.info({ page: pagesProcessed }, "No conversations in page");
        break;
      }

      for (const conv of response.conversations) {
        conversationIds.push(conv.id);
        totalFetched++;
      }

      const nextCursor = response.pages.next?.starting_after ?? null;

      logger.info(
        {
          page: pagesProcessed,
          pageSize: response.conversations.length,
          totalFetched,
          hasMore: !!nextCursor,
          nextCursor,
        },
        "Page fetched"
      );

      currentCursor = nextCursor;
    }

    const result = {
      totalFetched,
      pagesProcessed,
      conversationIds,
      nextCursor: currentCursor,
    };

    logger.info(result, "Fetch completed");

    console.log("\n" + JSON.stringify(result, null, 2) + "\n");
  }
);
