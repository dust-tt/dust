import PQueue from "p-queue";
import { Sequelize } from "sequelize";

import { nodeIdFromNotionId } from "@connectors/connectors/notion";
import {
  getDatabaseChildrenOf,
  getNotionDatabaseFromConnectorsDb,
  getNotionPageFromConnectorsDb,
  getPageChildrenOf,
} from "@connectors/connectors/notion/lib/connectors_db_helpers";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { updateDataSourceDocumentParents } from "@connectors/lib/data_sources";
import { NotionDatabase, NotionPage } from "@connectors/lib/models/notion";
import parentLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { cacheWithRedis } from "@connectors/types";

const logger = parentLogger.child({ provider: "notion" });

/** Compute the parents field for a notion pageOrDb See the [Design
 * Doc](https://www.notion.so/dust-tt/Engineering-e0f834b5be5a43569baaf76e9c41adf2?p=3d26536a4e0a464eae0c3f8f27a7af97&pm=s)
 * and the field documentation [in
 * core](https://github.com/dust-tt/dust/blob/main/core/src/data_sources/data_source.rs)
 * for relevant details
 *
 * @param memoizationKey optional key to control memoization of this function (not effectively used by the function)
 *
 */
async function _getParents(
  connectorId: ModelId,
  pageOrDbId: string,
  seen: string[],
  syncing: boolean = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used for memoization
  memoizationKey?: string
): Promise<string[]> {
  const parents: string[] = [pageOrDbId];
  const pageOrDb =
    (await getNotionPageFromConnectorsDb(connectorId, pageOrDbId)) ||
    (await getNotionDatabaseFromConnectorsDb(connectorId, pageOrDbId));

  if (!pageOrDb) {
    // pageOrDb is either 1. not synced yet (not an issue, see design doc) or 2. is not in Dust's scope.
    // If called during the sync (with syncing: true) we assume 1 and add a special parent "syncing".
    // Otherwise, we assume 2. and return the page in the Orphaned Resources.
    // This indicates that the page's parents are not yet known.
    if (syncing) {
      return [pageOrDbId, "syncing"];
    } else {
      return [pageOrDbId, "unknown"];
    }
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
      seen.push(pageOrDbId);
      if (!pageOrDb.parentId) {
        logger.error(
          {
            connectorId,
            pageOrDbId,
            parentId: pageOrDb.parentId,
          },
          "getParents: parentId is undefined"
        );
        throw new Error("getParent parentId is undefined");
      }
      if (seen.includes(pageOrDb.parentId)) {
        logger.error(
          {
            connectorId,
            pageOrDbId,
            seen,
            parentId: pageOrDb.parentId,
          },
          "getParents: Infinite loop"
        );
        return parents.concat(seen);
      }
      return parents.concat(
        // parentId cannot be undefined if parentType is page or database as per
        // Notion API
        //
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await getParents(
          connectorId,
          pageOrDb.parentId,
          seen,
          syncing,
          memoizationKey
        )
      );
    }
    default:
      throw new Error(`Unhandled parent type ${pageOrDb.parentType}`);
  }
}

export const getParents = cacheWithRedis(
  _getParents,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used for memoization
  (connectorId, pageOrDbId, seen, syncing, memoizationKey) => {
    return `${connectorId}:${pageOrDbId}:${memoizationKey}`;
  },
  // parents should be stable over the maximum time if memoized (almost a day).
  {
    ttlMs: 23 * 60 * 60 * 1000,
  }
);

export async function updateAllParentsFields(
  connectorId: ModelId,
  createdOrMovedNotionPageIds: string[],
  createdOrMovedNotionDatabaseIds: string[],
  memoizationKey?: string,
  onProgress?: () => Promise<void>
): Promise<number> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  /* Computing all descendants, then updating, ensures the field is updated only
    once per page, limiting the load on the Datasource */
  const pageAndDatabaseIdsToUpdate = await getPagesAndDatabasesToUpdate(
    createdOrMovedNotionPageIds,
    createdOrMovedNotionDatabaseIds,
    connectorId,
    onProgress
  );

  logger.info(
    {
      connectorId,
      pageIdsToUpdateCount: pageAndDatabaseIdsToUpdate.size,
    },
    "updateAllParentsFields: Updating parents field for pages and databases"
  );

  // Update everybody's parents field. Use of a memoization key to control
  // sharing memoization across updateAllParentsFields calls, which
  // can be desired or not depending on the use case
  const q = new PQueue({ concurrency: 16 });
  const promises: Promise<void>[] = [];
  for (const pageOrDbId of pageAndDatabaseIdsToUpdate) {
    promises.push(
      q.add(async () => {
        const pageOrDbIds = await getParents(
          connectorId,
          pageOrDbId,
          [],
          false,
          memoizationKey
        );

        const parents = pageOrDbIds.map((id) => nodeIdFromNotionId(id));
        if (parents.length === 1) {
          const page = await getNotionPageFromConnectorsDb(
            connectorId,
            pageOrDbId
          );
          if (page && page.parentId !== "workspace") {
            logger.warn(
              {
                connectorId,
                parents,
                parentType: page.parentType,
                parentId: page.parentId,
              },
              "notionUpdateAllParentsFields: Page has no parent."
            );
          } else if (!page) {
            const database = await getNotionDatabaseFromConnectorsDb(
              connectorId,
              pageOrDbId
            );
            if (database && database.parentId !== "workspace") {
              logger.warn(
                {
                  connectorId,
                  parents,
                  parentType: database?.parentType,
                  parentId: database?.parentId,
                },
                "notionUpdateAllParentsFields: Database has no parent."
              );
            }
          }
        }
        await updateDataSourceDocumentParents({
          dataSourceConfig: dataSourceConfigFromConnector(connector),
          documentId: nodeIdFromNotionId(pageOrDbId),
          parents,
          parentId: parents[1] || null,
        });
        if (onProgress) {
          await onProgress();
        }
      })
    );
  }

  await Promise.all(promises);
  return pageAndDatabaseIdsToUpdate.size;
}

/**  Get ids of all pages & databases whose parents field should be updated: initial pages in
 * pageOrDbs, and all the descendants of pageOrDbs that are pages or databases (including
 * children of databases)
 */
async function getPagesAndDatabasesToUpdate(
  createdOrMovedNotionPageIds: string[],
  createdOrMovedNotionDatabaseIds: string[],
  connectorId: ModelId,
  onProgress?: () => Promise<void>
): Promise<Set<string>> {
  const pageAndDataBaseIdsToUpdate: Set<string> = new Set([
    ...createdOrMovedNotionPageIds,
    ...createdOrMovedNotionDatabaseIds,
  ]);

  // we need to look at all descendants of these objects, and add
  // those that are pages to pageAndDataBaseIdsToUpdate
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
    if (onProgress) {
      await onProgress();
    }
    const pageOrDbIdToProcess = shift() as string; // guaranteed to be defined as toUpdate.size > 0
    visited.add(pageOrDbIdToProcess);

    const [pageChildren, databaseChildren] = await Promise.all([
      getPageChildrenOf(connectorId, pageOrDbIdToProcess),
      getDatabaseChildrenOf(connectorId, pageOrDbIdToProcess),
    ]);

    // add all page and DB children to pageIdsToUpdate & toProcess
    for (const child of [...pageChildren, ...databaseChildren]) {
      if (visited.has(notionPageOrDbId(child))) {
        continue;
      }
      const childId = notionPageOrDbId(child);
      pageAndDataBaseIdsToUpdate.add(childId);
      toProcess.add(childId);
    }
  }

  return pageAndDataBaseIdsToUpdate;
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
