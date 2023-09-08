import memoize from "lodash.memoize";

import {
  getDatabaseChildrenOf,
  getNotionDatabaseFromConnectorsDb,
  getNotionPageFromConnectorsDb,
  getPageChildrenOf,
} from "@connectors/connectors/notion/lib/connectors_db_helpers";
import { updateDocumentParentsField } from "@connectors/lib/data_sources";
import { NotionDatabase, NotionPage } from "@connectors/lib/models";
import {
  DataSourceConfig,
  DataSourceInfo,
} from "@connectors/types/data_source_config";

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
  dataSourceInfo: DataSourceInfo,
  pageOrDbId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used for memoization
  memoizationKey?: string
): Promise<string[]> {
  const parents: string[] = [pageOrDbId];
  const pageOrDb =
    (await getNotionPageFromConnectorsDb(dataSourceInfo, pageOrDbId)) ||
    (await getNotionDatabaseFromConnectorsDb(dataSourceInfo, pageOrDbId));
  if (!pageOrDb) {
    // pageOrDb is either not synced yet (not an issue, see design doc) or
    // is not in Dust's scope, in both cases we can just return the page id
    return parents;
  }
  switch (pageOrDb.parentType) {
    case "workspace":
      return parents;
    case "block":
      // rare cases in which doing something here is useful
      // are ignored for now, see the design doc for details
      return parents;
    case "page":
    case "database": {
      return parents.concat(
        // parentId cannot be undefined here
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await getParents(dataSourceInfo, pageOrDb.parentId!, memoizationKey)
      );
    }
    default:
      throw new Error(`Unhandled parent type ${pageOrDb.parentType}`);
  }
}

export const getParents = memoize(
  _getParents,
  (dataSourceInfo, pageOrDbId, memoizationKey) => {
    return `${dataSourceInfo.dataSourceName}:${pageOrDbId}:${memoizationKey}`;
  }
);

export async function updateAllParentsFields(
  dataSourceConfig: DataSourceConfig,
  pageOrDbs: (NotionPage | NotionDatabase)[],
  memoizationKey?: string
): Promise<number> {
  /* Computing all descendants, then updating, ensures the field is updated only
    once per page, limiting the load on the Datasource */
  const pagesToUpdate = await getPagesToUpdate(pageOrDbs, dataSourceConfig);

  // Update everybody's parents field. Use of a memoization key to control
  // sharing memoization across updateAllParentsFields calls, which
  // can be desired or not depending on the use case
  for (const page of pagesToUpdate) {
    const parents = await getParents(
      dataSourceConfig,
      page.notionPageId,
      memoizationKey
    );

    await updateDocumentParentsField(
      dataSourceConfig,
      `notion-${page.notionPageId}`,
      parents
    );
  }
  return pagesToUpdate.length;
}

/**  Get ids of all pages whose parents field should be updated: initial pages in
 * pageOrDbs, and all the descendants of pageOrDbs that are pages (including
 * children of databases)
 *
 * Note: databases are not stored in the Datasource, so they don't need to be
 * updated
 */
async function getPagesToUpdate(
  pageOrDbs: (NotionPage | NotionDatabase)[],
  dataSourceConfig: DataSourceConfig
): Promise<NotionPage[]> {
  const pagesToUpdate: NotionPage[] = [];

  let i = 0;
  while (i < pageOrDbs.length) {
    // Visit next document and if it's a page add it to update list
    const pageOrDb = pageOrDbs[i++] as NotionPage | NotionDatabase;
    const pageOrDbId = notionPageOrDbId(pageOrDb);
    if ((pageOrDb as NotionPage).notionPageId) {
      pagesToUpdate.push(pageOrDb as NotionPage);
    }

    // Get children of the document
    const pageChildren = await getPageChildrenOf(dataSourceConfig, pageOrDbId);
    const databaseChildren = await getDatabaseChildrenOf(
      dataSourceConfig,
      pageOrDbId
    );

    // If they haven't yet been visited, add them to documents visited
    // and to the list of documents whose children should be fetched
    for (const child of [...pageChildren, ...databaseChildren]) {
      if (
        !pageOrDbs.some((d) => notionPageOrDbId(d) === notionPageOrDbId(child))
      ) {
        pageOrDbs.push(child);
      }
    }
  }

  return pagesToUpdate;
}

function notionPageOrDbId(pageOrDb: NotionPage | NotionDatabase): string {
  return (
    (pageOrDb as NotionPage).notionPageId ||
    (pageOrDb as NotionDatabase).notionDatabaseId
  );
}
