import type {
  ConnectorsAPIError,
  ContentNodesViewType,
  CoreAPIError,
  DataSourceViewCategory,
  LightContentNode,
  Result,
} from "@dust-tt/types";
import { ConnectorsAPI, CoreAPI, Ok } from "@dust-tt/types";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";

export const getDataSourceCategory = (
  dataSource: DataSourceResource
): DataSourceViewCategory => {
  if (dataSource.isFolder()) {
    return "folder";
  }

  if (dataSource.isWebcrawler()) {
    return "website";
  }

  return "managed";
};

export const getDataSourceContent = async (
  auth: Authenticator,
  dataSource: DataSourceResource,
  viewType: ContentNodesViewType,
  rootIds: string[] | null,
  parentId: string | null,
  { limit, offset }: { limit: number; offset: number }
): Promise<Result<LightContentNode[], ConnectorsAPIError | CoreAPIError>> => {
  return dataSource.connectorId
    ? getManagedDataSourceContent(
        auth,
        dataSource.connectorId,
        rootIds,
        parentId,
        viewType
      )
    : getUnmanagedDataSourceContent(dataSource, viewType, {
        limit,
        offset,
      });
};

export const getManagedDataSourceContent = async (
  auth: Authenticator,
  connectorId: string,
  rootIds: string[] | null,
  parentId: string | null,
  viewType: ContentNodesViewType
): Promise<Result<LightContentNode[], ConnectorsAPIError>> => {
  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );
  const contentNodes = [];
  if (parentId || !rootIds) {
    const nodesResults = await connectorsAPI.getConnectorPermissions({
      connectorId,
      filterPermission: "read",
      parentId: parentId ?? undefined,
      viewType,
    });

    if (nodesResults.isErr()) {
      return nodesResults;
    }

    contentNodes.push(...nodesResults.value.resources);
  } else {
    const nodesResults = await connectorsAPI.getContentNodes({
      connectorId,
      internalIds: rootIds,
      viewType,
    });

    if (nodesResults.isErr()) {
      return nodesResults;
    }
    contentNodes.push(...nodesResults.value.nodes);
  }

  const results = contentNodes.map((r) => ({
    internalId: r.internalId,
    parentInternalId: r.parentInternalId,
    type: r.type,
    title: r.title,
    expandable: r.expandable,
    preventSelection: r.preventSelection,
    dustDocumentId: r.dustDocumentId,
    lastUpdatedAt: r.lastUpdatedAt,
    titleWithParentsContext: r.titleWithParentsContext,
    sourceUrl: r.sourceUrl,
  }));

  return new Ok(results);
};

export const getUnmanagedDataSourceContent = async (
  dataSource: DataSourceResource,
  viewType: ContentNodesViewType,
  { limit, offset }: { limit: number; offset: number }
): Promise<Result<LightContentNode[], CoreAPIError>> => {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  if (viewType === "documents") {
    const documentsRes = await coreAPI.getDataSourceDocuments({
      projectId: dataSource.dustAPIProjectId,
      dataSourceName: dataSource.name,
      limit,
      offset,
    });

    if (documentsRes.isErr()) {
      return documentsRes;
    }

    const documentsAsContentNodes = documentsRes.value.documents.map((doc) => ({
      dustDocumentId: doc.document_id,
      expandable: false,
      internalId: doc.document_id,
      lastUpdatedAt: doc.timestamp,
      parentInternalId: null,
      preventSelection: false,
      sourceUrl: doc.source_url ?? null,
      title: doc.document_id,
      type: "file" as const,
    }));

    return new Ok(documentsAsContentNodes);
  } else {
    const tablesRes = await coreAPI.getTables({
      projectId: dataSource.dustAPIProjectId,
      dataSourceName: dataSource.name,
    });

    if (tablesRes.isErr()) {
      return tablesRes;
    }

    const tablesAsContentNodes = tablesRes.value.tables.map((table) => ({
      dustDocumentId: table.table_id,
      expandable: false,
      internalId: table.table_id,
      lastUpdatedAt: table.timestamp,
      parentInternalId: null,
      preventSelection: false,
      sourceUrl: null,
      title: table.name,
      type: "database" as const,
    }));

    return new Ok(tablesAsContentNodes);
  }
};
