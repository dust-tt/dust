import { ConnectorsAPI, Err, Ok } from "@dust-tt/types";

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
    r.isOk() ? r.value.resources : []
  );

  return new Ok(results);
};

export const getUnmanagedDataSourceContent = async (
  dataSource: DataSourceResource,
  parentIds: string[] | null,
  viewType: "tables" | "documents"
) => {
  // TODO(thomas 20240809) implement this for folders
  logger.info("getUnmanagedDataSourceContent", dataSource, parentIds, viewType);
  return new Err(new Error("Not supported"));
};
