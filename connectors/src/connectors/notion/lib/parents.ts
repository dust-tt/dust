import {
  DataSourceConfig,
  DataSourceInfo,
} from "@connectors/types/data_source_config";
import {
  getDatabaseChildrenOfDocument,
  getNotionPageFromConnectorsDb,
  getPageChildrenOfDocument,
} from "./connectors_db_helpers";
import { NotionDatabase, NotionPage } from "@connectors/lib/models";
import memoize from "lodash.memoize";
import { updateDocumentParentsField } from "@connectors/lib/data_sources";

/** Compute the parents field for a notion document
 * See the [Design Doc](TODO) and the field [documentation in core](TODO) for relevant details
 */
async function _getParents(
  dataSourceInfo: DataSourceInfo,
  document: {
    notionId: string;
    parentType: string | null | undefined;
    parentId: string | null | undefined;
  }
): Promise<string[]> {
  const parents: string[] = [document.notionId];
  switch (document.parentType) {
    case "workspace":
      return parents;
    case "block":
      // rare cases in which doing something here is useful
      // are ignored for now, see the design doc for details
      return parents;
    case "page":
    case "database":
      // retrieve the parent from notion connectors db
      // and add it to the parents array
      let parent = await getNotionPageFromConnectorsDb(
        dataSourceInfo,
        document.parentId as string // (cannot be null here)
      );
      if (!parent) {
        // The parent is either not synced yet (not an issue, see design doc) or
        // is not in Dust's scope, in both cases we can just return the page id
        return parents;
      }
      return parents.concat(
        await getParents(dataSourceInfo, {
          notionId: parent.notionPageId,
          parentType: parent.parentType,
          parentId: parent.parentId,
        })
      );
    default:
      throw new Error(`Unhandled parent type ${document.parentType}`);
  }
}

export const getParents = memoize(_getParents, (dataSourceInfo, document) => {
  return `${dataSourceInfo.dataSourceName}:${document.notionId}`;
});

export async function updateAllParentsFields(
  dataSourceConfig: DataSourceConfig,
  documents: (NotionPage | NotionDatabase)[]
) {
  /* Computing all descendants, then updating, ensures the field is updated only
    once per page, limiting the load on the Datasource */
  const pagesToUpdate = await getPagesToUpdate(documents, dataSourceConfig);

  // Update everybody's parents field
  for (const page of pagesToUpdate) {
    const parents = await getParents(dataSourceConfig, {
      notionId: page.notionPageId,
      parentType: page.parentType,
      parentId: page.parentId,
    });

    await updateDocumentParentsField(
      dataSourceConfig,
      `notion-${page.notionPageId}`,
      parents
    );
    // TODO how to handle errors here
  }
}

/**  Get ids of all pages whose parents field should be updated: inital pages in
 * documentIds, and all the descendants of documentIds that are pages (including
 * children of databases)
 *
 * Note: databases are not stored in the Datasource, so they don't need to be
 * updated
 */
async function getPagesToUpdate(
  documents: (NotionPage | NotionDatabase)[],
  dataSourceConfig: DataSourceConfig
): Promise<NotionPage[]> {
  const documentVisitedIds = new Set<NotionPage | NotionDatabase>(documents);

  // documents is a queue of documents whose children should be fetched
  while (documents.length !== 0) {
    const document = documents.shift()!;

    // Get children of the document
    const documentId =
      (document as NotionPage).notionPageId ||
      (document as NotionDatabase).notionDatabaseId;
    const pageChildren = await getPageChildrenOfDocument(
      dataSourceConfig,
      documentId
    );
    const databaseChildren = await getDatabaseChildrenOfDocument(
      dataSourceConfig,
      documentId
    );

    // If they haven't yet been visited, add them to documents visited
    // and to the list of documents whose children should be fetched
    for (const child of [...pageChildren, ...databaseChildren]) {
      if (!documentVisitedIds.has(child)) {
        documentVisitedIds.add(child);
        documents.push(child);
      }
    }
  }

  // only return pages since databases are not updated
  return Array.from(documentVisitedIds).filter(
    (d) => (d as NotionPage).notionPageId
  ) as NotionPage[];
}
