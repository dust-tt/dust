// Some Notion resources (pages or databases) have a parent that is a `block`.
// We don't indent blocks, so we attempt to go up the tree until we find a
// non-block parent.
// This migration attempts to backfill the parent of all blocks that have a block parent

import PQueue from "p-queue";
import { Op } from "sequelize";

import { notionConfig } from "@connectors/connectors/notion/lib/config";
import { getBlockParentMemoized } from "@connectors/connectors/notion/lib/notion_api";
import { NotionDatabase, NotionPage } from "@connectors/lib/models/notion";
import { getAccessTokenFromNango } from "@connectors/lib/nango_helpers";
import mainLogger from "@connectors/logger/logger";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

const logger = mainLogger.child({
  migration: "20230828_notion_block_parents",
});

const { getRequiredNangoNotionConnectorId } = notionConfig;

async function main() {
  const pagesAffected = await NotionPage.findAll({
    where: {
      parentType: "block",
      connectorId: {
        [Op.ne]: null,
      },
    },
  });
  const databasesAffected = await NotionDatabase.findAll({
    where: {
      parentType: "block",
      connectorId: {
        [Op.ne]: null,
      },
    },
  });

  const totalResourcesAffected =
    pagesAffected.length + databasesAffected.length;

  console.log(`Found ${totalResourcesAffected} resources with a block parent`);

  const connectorIds: number[] = Array.from(
    new Set([
      ...pagesAffected.map((page) => page.connectorId),
      ...databasesAffected.map((database) => database.connectorId),
    ] as number[])
  );

  const connectors = await ConnectorModel.findAll({
    where: {
      id: connectorIds,
    },
  });

  const notionAccessTokenByConnectorId: { [key: number]: string } = {};
  for (const connector of connectors) {
    if (notionAccessTokenByConnectorId[connector.id]) {
      continue;
    }
    const notionAccessToken = await getAccessTokenFromNango({
      connectionId: connector.connectionId,
      integrationId: getRequiredNangoNotionConnectorId(),
    });
    notionAccessTokenByConnectorId[connector.id] = notionAccessToken;
  }

  const queueByConnectorId: { [key: number]: PQueue } = {};
  for (const connectorId of connectorIds) {
    queueByConnectorId[connectorId] = new PQueue({
      concurrency: 1,
    });
  }

  let i = 1;
  let successCount = 0;
  let failedCount = 0;
  const promises: Promise<void>[] = [];

  for (const pageOrDb of [...pagesAffected, ...databasesAffected]) {
    const queue = queueByConnectorId[pageOrDb.connectorId as number];

    if (!queue) {
      throw new Error(`No queue for connector ${pageOrDb.connectorId}`);
    }

    promises.push(
      queue.add(async () => {
        console.log(
          `Processing ${i++} of ${totalResourcesAffected} (success: ${successCount}, failed: ${failedCount}))`
        );
        const blockId = pageOrDb.parentId;
        const notionAccessToken =
          notionAccessTokenByConnectorId[pageOrDb.connectorId as number];
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
      })
    );
  }

  await Promise.all(promises);

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
