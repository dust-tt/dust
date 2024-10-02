import type { ModelId } from "@dust-tt/types";
import { cacheWithRedis } from "@dust-tt/types";
import PQueue from "p-queue";
import { Sequelize } from "sequelize";

import {
  getDatabaseChildrenOf,
  getNotionDatabaseFromConnectorsDb,
  getNotionPageFromConnectorsDb,
  getPageChildrenOf,
} from "@connectors/connectors/notion/lib/connectors_db_helpers";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { updateDocumentParentsField } from "@connectors/lib/data_sources";
import { NotionDatabase, NotionPage } from "@connectors/lib/models/notion";
import { heartbeat } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

/** Compute the parents field for a notion pageOrDb See the [Design
 * Doc](https://www.notion.so/dust-tt/Engineering-e0f834b5be5a43569baaf76e9c41adf2?p=3d26536a4e0a464eae0c3f8f27a7af97&pm=s)
 * and the field documentation [in
 * core](https://github.com/dust-tt/dust/blob/main/core/src/data_sources/data_source.rs)
 * for relevant details
 *
 * @param memoizationKey optional key to control memoization of this function (not actually used by the functio)
 *
 */
async function _getParents(
  connectorId: ModelId,
  pageOrDbId: string,
  seen: string[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used for memoization
  memoizationKey?: string
): Promise<string[]> {
  const parents: string[] = [pageOrDbId];
  const pageOrDb =
    (await getNotionPageFromConnectorsDb(connectorId, pageOrDbId)) ||
    (await getNotionDatabaseFromConnectorsDb(connectorId, pageOrDbId));
  if (!pageOrDb) {
    // pageOrDb is either not synced yet (not an issue, see design doc) or
    // is not in Dust's scope, in both cases we can just return the page id
    return parents;
  }
  switch (pageOrDb.parentType) {
    // First 3 cases are exceptions that we ignore, and just return the page id
    // as parent
    // 1. null - sometimes the notion api fails to get the page correctly (see
    //    getParsedPage), in which case parentType is null
    // 2. unknown - when parsing the page, rare cases when the parentType isn't
    //    known => "unknown" is stored (see getParsedPage again)
    // 3. block - since we don't store blocks, parentType block is skipped in
    //    the code; should mostly not happen, but can happen in isolated cases
    //    (see https://dust4ai.slack.com/archives/C050SM8NSPK/p1693241129921369)
    case null:
    case "unknown":
      // If parentType is unknown, consider it as the parent page id.
      return [...parents, "unknown"];

    case "block":
    case "workspace":
      // workspace -> root level pages, with no parents other than themselves
      // (not an exception)
      return parents;
    case "page":
    case "database": {
      if (seen.includes(pageOrDbId)) {
        logger.error(
          {
            connectorId,
            pageOrDbId,
            seen,
            parentId: pageOrDb.parentId,
          },
          "getParents infinite loop"
        );
        return parents.concat(seen);
      }
      seen.push(pageOrDbId);
      if (!pageOrDb.parentId) {
        logger.error(
          {
            connectorId,
            pageOrDbId,
            parentId: pageOrDb.parentId,
          },
          "getParents parentId is undefined"
        );
        throw new Error("getParent parentId is undefined");
      }
      return parents.concat(
        // parentId cannot be undefined if parentType is page or database as per
        // Notion API
        //
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await getParents(connectorId, pageOrDb.parentId, seen, memoizationKey)
      );
    }
    default:
      throw new Error(`Unhandled parent type ${pageOrDb.parentType}`);
  }
}

export const getParents = cacheWithRedis(
  _getParents,
  (connectorId, pageOrDbId, seen, memoizationKey) => {
    return `${connectorId}:${pageOrDbId}:${memoizationKey}`;
  },
  60 * 10 * 1000
);

export async function updateAllParentsFields(
  connectorId: ModelId,
  createdOrMovedNotionPageIds: string[],
  createdOrMovedNotionDatabaseIds: string[],
  memoizationKey?: string,
  shouldHeartbeat = false
): Promise<number> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  /* Computing all descendants, then updating, ensures the field is updated only
    once per page, limiting the load on the Datasource */
  const pageIdsToUpdate = await getPagesToUpdate(
    createdOrMovedNotionPageIds,
    createdOrMovedNotionDatabaseIds,
    connectorId
  );

  logger.info(
    {
      connectorId,
      pageIdsToUpdateCount: pageIdsToUpdate.size,
    },
    "Updating parents field for pages"
  );

  // Update everybody's parents field. Use of a memoization key to control
  // sharing memoization across updateAllParentsFields calls, which
  // can be desired or not depending on the use case
  const q = new PQueue({ concurrency: 16 });
  const promises: Promise<void>[] = [];
  for (const pageId of pageIdsToUpdate) {
    promises.push(
      q.add(async () => {
        const parents = await getParents(
          connectorId,
          pageId,
          [],
          memoizationKey
        );
        logger.info(
          {
            connectorId,
            pageId,
          },
          "Updating parents field for page"
        );
        await updateDocumentParentsField({
          dataSourceConfig: dataSourceConfigFromConnector(connector),
          documentId: `notion-${pageId}`,
          parents,
        });
        if (shouldHeartbeat) {
          await heartbeat();
        }
      })
    );
  }

  await Promise.all(promises);
  return pageIdsToUpdate.size;
}

/**  Get ids of all pages whose parents field should be updated: initial pages in
 * pageOrDbs, and all the descendants of pageOrDbs that are pages (including
 * children of databases)
 *
 * Note: databases are not stored in the Datasource, so they don't need to be
 * updated
 */
async function getPagesToUpdate(
  createdOrMovedNotionPageIds: string[],
  createdOrMovedNotionDatabaseIds: string[],
  connectorId: ModelId
): Promise<Set<string>> {
  const pageIdsToUpdate: Set<string> = new Set([
    ...createdOrMovedNotionPageIds,
  ]);

  // we need to look at all descendants of these objects, and add
  // those that are pages to pageIdsToUpdate
  const toProcess = new Set([
    ...createdOrMovedNotionPageIds,
    ...createdOrMovedNotionDatabaseIds,
  ]);

  const shift = () => {
    for (const pageOrDbId of toProcess) {
      toProcess.delete(pageOrDbId);
      return pageOrDbId;
    }
  };
  const visited = new Set<string>();

  while (toProcess.size > 0) {
    const pageOrDbIdToProcess = shift() as string; // guaranteed to be defined as toUpdate.size > 0
    visited.add(pageOrDbIdToProcess);

    const pageChildren = await getPageChildrenOf(
      connectorId,
      pageOrDbIdToProcess
    );

    // add page children to pageIdsToUpdate
    for (const child of pageChildren) {
      const childId = notionPageOrDbId(child);
      pageIdsToUpdate.add(childId);
    }

    const databaseChildren = await getDatabaseChildrenOf(
      connectorId,
      pageOrDbIdToProcess
    );

    // add all page and DB children to toProcess
    for (const child of [...pageChildren, ...databaseChildren]) {
      if (visited.has(notionPageOrDbId(child))) {
        continue;
      }
      const childId = notionPageOrDbId(child);
      toProcess.add(childId);
    }
  }

  return pageIdsToUpdate;
}

function notionPageOrDbId(pageOrDb: NotionPage | NotionDatabase): string {
  return (
    (pageOrDb as NotionPage).notionPageId ||
    (pageOrDb as NotionDatabase).notionDatabaseId
  );
}

export const hasChildren = async (pages: NotionPage[], connectorId: number) => {
  const hasChildrenPage = (
    await NotionPage.findAll({
      attributes: [
        "parentId",
        [Sequelize.fn("COUNT", Sequelize.col("*")), "count"],
      ],
      where: {
        connectorId,
        parentId: pages.map((p) => p.notionPageId),
      },
      group: ["parentId"],
    })
  ).reduce<Record<string, boolean>>(
    (acc, d) => (d.parentId ? { ...acc, [d.parentId]: true } : acc),
    {}
  );

  const hasChildrenDb = (
    await NotionDatabase.findAll({
      attributes: [
        "parentId",
        [Sequelize.fn("COUNT", Sequelize.col("*")), "count"],
      ],
      where: {
        connectorId,
        parentId: pages.map((p) => p.notionPageId),
      },
      group: ["parentId"],
    })
  ).reduce<Record<string, boolean>>(
    (acc, d) => (d.parentId ? { ...acc, [d.parentId]: true } : acc),
    {}
  );

  return { ...hasChildrenPage, ...hasChildrenDb };
};

export const getOrphanedCount = async (connectorId: number) => {
  const [orphanedPagesCount, orphanedDbsCount] = await Promise.all([
    NotionPage.count({
      where: {
        connectorId: connectorId,
        parentId: "unknown",
      },
    }),
    NotionDatabase.count({
      where: {
        connectorId: connectorId,
        parentId: "unknown",
      },
    }),
  ]);

  return orphanedDbsCount + orphanedPagesCount;
};
