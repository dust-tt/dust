import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNodesViewType,
  CoreAPIError,
  DataSourceViewCategory,
  LightContentNode,
  Result,
} from "@dust-tt/types";
import { ConnectorsAPI, CoreAPI, Err, Ok } from "@dust-tt/types";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { isFolder, isWebsite } from "@app/lib/data_sources";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";

export const getDataSourceCategory = (
  dataSourceResource: DataSourceResource
): DataSourceViewCategory => {
  if (isFolder(dataSourceResource)) {
    return "folder";
  }

  if (isWebsite(dataSourceResource)) {
    return "website";
  }

  return "managed";
};

export const getDataSourceContent = async (
  auth: Authenticator,
  dataSource: DataSourceResource,
  permission: ConnectorPermission | undefined,
  viewType: ContentNodesViewType,
  rootIds: string[] | null,
  parentId: string | null,
  { limit, offset }: { limit: number; offset: number }
): Promise<Result<LightContentNode[], ConnectorsAPIError | CoreAPIError>> => {
  return dataSource.connectorId
    ? getManagedDataSourceContent(
        auth,
        dataSource.connectorId,
        permission,
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
  permission: ConnectorPermission | undefined,
  rootIds: string[] | null,
  parentId: string | null,
  viewType: ContentNodesViewType
): Promise<Result<LightContentNode[], ConnectorsAPIError>> => {
  switch (permission) {
    case "read":
      // We let users get the read  permissions of a connector
      // `read` is used for data source selection when creating personal assitsants
      break;
    case "write":
      // We let builders get the write permissions of a connector.
      // `write` is used for selection of default slack channel in the workspace assistant
      // builder.
      if (!auth.isBuilder()) {
        return new Err({
          type: "authorization_error",
          message:
            "Only builders of the current workspace can view 'write' permissions of a data source.",
        });
      }
      break;
    case undefined:
      // Only admins can browse "all" the resources of a connector.
      if (!auth.isAdmin()) {
        return new Err({
          type: "authorization_error",
          message:
            "Only admins of the current workspace can view all permissions of a data source.",
        });
      }
      break;
  }

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );
  const contentNodes = [];
  if (parentId || !rootIds) {
    const nodesResults = await connectorsAPI.getConnectorPermissions({
      connectorId,
      filterPermission: permission,
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
