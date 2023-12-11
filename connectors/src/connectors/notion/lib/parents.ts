import { cacheWithRedis, ModelId } from "@dust-tt/types";
import PQueue from "p-queue";

import {
  getDatabaseChildrenOf,
  getNotionDatabaseFromConnectorsDb,
  getNotionPageFromConnectorsDb,
  getPageChildrenOf,
} from "@connectors/connectors/notion/lib/connectors_db_helpers";
import { updateDocumentParentsField } from "@connectors/lib/data_sources";
import { Connector } from "@connectors/lib/models";
import { NotionDatabase, NotionPage } from "@connectors/lib/models/notion";
import logger from "@connectors/logger/logger";

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
    case "block":
    case "workspace":
      // workspace -> root level pages, with no parents other than themselves
      // (not an exception)
      return parents;
    case "page":
    case "database": {
      return parents.concat(
        // parentId cannot be undefined if parentType is page or database as per
        // Notion API
        //
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await getParents(connectorId, pageOrDb.parentId!, memoizationKey)
      );
    }
    default:
      throw new Error(`Unhandled parent type ${pageOrDb.parentType}`);
  }
}

export const getParents = cacheWithRedis(
  _getParents,
  (connectorId, pageOrDbId, memoizationKey) => {
    return `${connectorId}:${pageOrDbId}:${memoizationKey}`;
  },
  60 * 10 * 1000
);

export async function updateAllParentsFields(
  connectorId: ModelId,
  createdOrMovedNotionPageIds: string[],
  createdOrMovedNotionDatabaseIds: string[],
  memoizationKey?: string
): Promise<number> {
  const connector = await Connector.findByPk(connectorId);
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
        const parents = await getParents(connectorId, pageId, memoizationKey);
        logger.info(
          {
            connectorId,
            pageId,
          },
          "Updating parents field for page"
        );
        await updateDocumentParentsField({
          dataSourceConfig: {
            dataSourceName: connector.dataSourceName,
            workspaceId: connector.workspaceId,
            workspaceAPIKey: connector.workspaceAPIKey,
          },
          documentId: `notion-${pageId}`,
          parents,
        });
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
