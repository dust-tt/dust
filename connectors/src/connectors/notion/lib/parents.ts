import { DataSourceInfo } from "@connectors/types/data_source_config";
import { getNotionPageFromConnectorsDb } from "./connectors_db_helpers";
import { NotionDatabase, NotionPage } from "@connectors/lib/models";
import { get } from "http";

/** Compute the parents field for a notion document
 * See the [Design Doc](TODO) and the field [documentation in core](TODO) for relevant details
 */
export async function getParents(
  page: {
    notionId: string;
    parentType: string | null | undefined;
    parentId: string | null | undefined;
  },
  dataSourceInfo: DataSourceInfo
): Promise<string[]> {
  const parents: string[] = [page.notionId];
  switch (page.parentType) {
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
        page.parentId as string // (cannot be null here)
      );
      if (!parent) {
        // The parent is either not synced yet (not an issue, see design doc) or
        // is not in Dust's scope, in both cases we can just return the page id
        return parents;
      }
      return parents.concat(
        await getParents(
          {
            notionId: parent.notionPageId,
            parentType: parent.parentType,
            parentId: parent.parentId,
          },
          dataSourceInfo
        )
      );
    default:
      throw new Error(`Unhandled parent type ${page.parentType}`);
  }
}

export async function updateParentsField(
  pageOrDb: NotionPage | NotionDatabase,
  dataSourceInfo: DataSourceInfo,
  parents?: string[]
) {
  let notionId =
    (pageOrDb as NotionPage).notionPageId ||
    (pageOrDb as NotionDatabase).notionDatabaseId;

  parents = parents ? [notionId, ...parents] : await getParents(
    {
      notionId,
      parentType: pageOrDb.parentType,
      parentId: pageOrDb.parentId,
    },
    dataSourceInfo
  );
  // dbs are not in the Datasource so they don't have a parents field
  // only notion pages need an update
  (pageOrDb as NotionPage).notionPageId &&
    updateParentsFieldInDatasource(pageOrDb as NotionPage, parents);
  for (const child of getChildren(pageOrDb)) {
    await updateParentsField(child, dataSourceInfo, parents);
  }
}

function updateParentsFieldInDatasource(
  pageOrDb: NotionPage,
  parents: string[]
) {}

function getChildren(pageOrDb: NotionPage | NotionDatabase) {
}
