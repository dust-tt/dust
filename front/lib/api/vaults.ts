import { ConnectorsAPI, CoreAPI, Ok } from "@dust-tt/types";

import config from "@app/lib/api/config";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";

export const getManagedDataSourceContent = async (
  connectorId: string,
  permission: "read" | "write" | "read_write" | "none",
  parentIds: string[] | null,
  viewType: "tables" | "documents"
) => {
  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const contentNodes = [];
  if (!parentIds) {
    contentNodes.push(
      await connectorsAPI.getConnectorPermissions({
        connectorId,
        filterPermission: permission,
        viewType,
      })
    );
  } else {
    for (const parentId of parentIds) {
      contentNodes.push(
        await connectorsAPI.getConnectorPermissions({
          connectorId,
          parentId,
          filterPermission: permission,
          viewType,
        })
      );
    }
  }
  const err = contentNodes.find((r) => r.isErr());
  if (err?.isErr()) {
    return err;
  }

  const results = contentNodes.flatMap((r) =>
    r.isOk()
      ? r.value.resources.map((r) => ({
          internalId: r.internalId,
          parentInternalId: r.parentInternalId,
          type: r.type,
          title: r.title,
          expandable: r.expandable,
          preventSelection: r.preventSelection,
          dustDocumentId: r.dustDocumentId,
          lastUpdatedAt: r.lastUpdatedAt,
        }))
      : []
  );

  return new Ok(results);
};

export const getUnmanagedDataSourceContent = async (
  dataSource: DataSourceResource,
  parentIds: string[] | null,
  viewType: "tables" | "documents",
  limit: number,
  offset: number
) => {
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
      internalId: "string",
      parentInternalId: null,
      type: "file" as const,
      title: doc.document_id,
      expandable: false,
      preventSelection: false,
      dustDocumentId: doc.document_id,
      lastUpdatedAt: doc.timestamp,
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
      internalId: "string",
      parentInternalId: null,
      type: "database" as const,
      title: table.name,
      expandable: false,
      preventSelection: false,
      dustDocumentId: table.table_id,
      lastUpdatedAt: table.timestamp,
    }));

    return new Ok(tablesAsContentNodes);
  }
};
