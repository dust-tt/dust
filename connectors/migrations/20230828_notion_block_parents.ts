// Some Notion resources (pages or databases) have a parent that is a `block`.
// We don't indent blocks, so we attempt to go up the tree until we find a
// non-block parent.
// This migration attempts to backfill the parent of all blocks that have a block parent

import { getBlockParentMemoized } from "@connectors/connectors/notion/lib/notion_api";
import { Connector, NotionDatabase, NotionPage } from "@connectors/lib/models";
import { nango_client } from "@connectors/lib/nango_client";
import mainLogger from "@connectors/logger/logger";

const logger = mainLogger.child({
  migration: "20230828_notion_block_parents",
});

async function main() {
  const { NANGO_NOTION_CONNECTOR_ID } = process.env;

  if (!NANGO_NOTION_CONNECTOR_ID) {
    throw new Error("NANGO_NOTION_CONNECTOR_ID not set");
  }

  const pagesAffected = await NotionPage.findAll({
    where: {
      parentType: "block",
    },
  });
  const databasesAffected = await NotionDatabase.findAll({
    where: {
      parentType: "block",
    },
  });

  const totalResourcesAffected =
    pagesAffected.length + databasesAffected.length;

  console.log(`Found ${totalResourcesAffected} resources with a block parent`);

  const connectorIds = Array.from(
    new Set([
      ...pagesAffected.map((page) => page.connectorId),
      ...databasesAffected.map((database) => database.connectorId),
    ])
  );

  const connectors = await Connector.findAll({
    where: {
      id: connectorIds,
    },
  });

  const notionAccessTokenByConnectorId: { [key: number]: string } = {};
  for (const connector of connectors) {
    if (notionAccessTokenByConnectorId[connector.id]) {
      continue;
    }
    const notionAccessToken = await nango_client().getToken(
      NANGO_NOTION_CONNECTOR_ID,
      connector.connectionId
    );
    notionAccessTokenByConnectorId[connector.id] = notionAccessToken;
  }

  let i = 1;
  let successCount = 0;
  let failedCount = 0;
  for (const pageOrDb of [...pagesAffected, ...databasesAffected]) {
    console.log(
      `Processing ${i++} of ${totalResourcesAffected} (success: ${successCount}, failed: ${failedCount}))`
    );
    const blockId = pageOrDb.parentId;
    const notionAccessToken =
      notionAccessTokenByConnectorId[pageOrDb.connectorId];
    if (!notionAccessToken) {
      throw new Error(
        `No notion access token for connector ${pageOrDb.connectorId}`
      );
    }
    if (!blockId) {
      throw new Error(`No parentId for pageOrDb ${pageOrDb.id}`);
    }

    const parent = await getBlockParentMemoized(
      notionAccessToken,
      blockId,
      logger
    );
    if (parent) {
      successCount += 1;
      pageOrDb.parentId = parent.parentId;
      pageOrDb.parentType = parent.parentType;
      await pageOrDb.save();
    } else {
      failedCount += 1;
    }
  }

  console.log(
    `Finished processing ${totalResourcesAffected} (success: ${successCount}, failed: ${failedCount}))`
  );
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
