import type {
  ConnectorProvider,
  DataSourceSearchResultType,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import type { SearchClient } from "algoliasearch";
import algoliasearch from "algoliasearch";

const SEARCH_INDEX_NAME = "data_sources_search";

type DataSourceSearchDocument = {
  workspaceId: string;
  dataSourceName: string;
  connectorProvider: ConnectorProvider | null;
  documentId: string;

  title: string;
  content: string;

  // Document primary key on search server (algolia for now)
  objectID: string;
};

let CLIENT: SearchClient | null = null;

function documentPrimaryKey({
  workspaceId,
  dataSourceName,
  documentId,
}: {
  workspaceId: string;
  dataSourceName: string;
  documentId: string;
}) {
  return `${workspaceId}:${dataSourceName}:${documentId}`;
}

function _getClient() {
  if (CLIENT) {
    return CLIENT;
  }
  CLIENT = algoliasearch("2WLQ3OWTO8", "70a7a36ab1f871db3805fcf80822fdc1");

  return CLIENT;
}

export async function dataSourceSearchUpsert({
  owner,
  dataSource,
  documentId,
  title,
  content,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  documentId: string;
  title: string;
  content: string;
}) {
  const res = await _getClient()
    .initIndex(SEARCH_INDEX_NAME)
    .saveObject({
      objectID: documentPrimaryKey({
        workspaceId: owner.sId,
        dataSourceName: dataSource.name,
        documentId,
      }),
      workspaceId: owner.sId,
      dataSourceName: dataSource.name,
      connectorProvider: dataSource.connectorProvider,

      documentId,
      title,
      content,
    } satisfies DataSourceSearchDocument);

  console.log("saved object to search index", res.objectID);
  return new Ok(res.objectID);
}

export async function dataSourceSearch({
  workspaceId,
  query,
}: {
  workspaceId: string;
  query: string;
}): Promise<DataSourceSearchResultType[]> {
  const res = await _getClient()
    .initIndex(SEARCH_INDEX_NAME)
    .search(query, {
      filters: `workspaceId:${workspaceId}`,
    });

  return res.hits.map((hit): DataSourceSearchResultType => {
    const doc = hit as DataSourceSearchDocument;
    return {
      documentId: doc.documentId,
      dataSourceName: doc.dataSourceName,
      documentTitle: doc.title,
      connectorProvider: doc.connectorProvider,
      highlightedText: "FAKE HIGHLIGHTED",
      updatedAt: new Date().getTime(),
    };
  });
}
