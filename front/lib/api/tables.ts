import type {
  CoreAPIError,
  CoreAPITable,
  Result,
  WorkspaceType,
} from "@dust-tt/types";
import { CoreAPI, Err, Ok } from "@dust-tt/types";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";

type NotFoundError = {
  type: "table_not_found" | "file_not_found";
  message: string;
};

export type TableOperationError =
  | {
      type: "internal_server_error";
      coreAPIError: CoreAPIError;
      message: string;
    }
  | {
      type: "invalid_request_error";
      message: string;
    }
  | {
      type: "not_found_error";
      notFoundError: NotFoundError;
    };

export async function deleteTable({
  owner,
  dataSource,
  tableId,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceResource;
  tableId: string;
}): Promise<Result<null, TableOperationError>> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const deleteRes = await coreAPI.deleteTable({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    tableId,
  });
  if (deleteRes.isErr()) {
    logger.error(
      {
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        dataSourceName: dataSource.name,
        workspaceId: owner.id,
        error: deleteRes.error,
      },
      "Failed to delete table."
    );
    if (deleteRes.error.code === "table_not_found") {
      return new Err({
        type: "not_found_error",
        notFoundError: {
          type: "table_not_found",
          message: "The table you requested was not found.",
        },
      });
    }
    return new Err({
      type: "internal_server_error",
      coreAPIError: deleteRes.error,
      message: "Failed to delete table.",
    });
  }
  // We do not delete the related AgentTablesQueryConfigurationTable entry if any.
  // This is because the table might be created again with the same name and we want to keep the configuration.
  // The agent Builder displays an error on the action card if it misses a table.

  return new Ok(null);
}

export async function upsertTableFromCsv({
  auth,
  dataSource,
  tableName,
  tableDescription,
  tableId,
  tableTimestamp,
  tableTags,
  tableParentId,
  tableParents,
  fileId,
  truncate,
  title,
  mimeType,
  sourceUrl,
}: {
  auth: Authenticator;
  dataSource: DataSourceResource;
  tableName: string;
  tableDescription: string;
  tableId: string;
  tableTimestamp: number | null;
  tableTags: string[];
  tableParentId: string | null;
  tableParents: string[];
  fileId: string | null;
  truncate: boolean;
  title: string;
  mimeType: string;
  sourceUrl: string | null;
}): Promise<Result<{ table: CoreAPITable }, TableOperationError>> {
  const owner = auth.getNonNullableWorkspace();
  const file: FileResource | null = fileId
    ? await FileResource.fetchById(auth, fileId)
    : null;
  if (fileId && !file) {
    return new Err({
      type: "not_found_error",
      notFoundError: {
        type: "file_not_found",
        message:
          "The file associated with the fileId you provided was not found",
      },
    });
  }

  if (file) {
    if (file.status !== "ready") {
      return new Err({
        type: "invalid_request_error",
        message: "The file provided is not ready",
      });
    }

    const VALID_USE_CASES = ["upsert_table", "conversation", "tool_output"];
    if (!VALID_USE_CASES.includes(file.useCase)) {
      return new Err({
        type: "invalid_request_error",
        message: `The file provided has not the expected use-case. Expected one of: ${VALID_USE_CASES.join(
          ", "
        )}`,
      });
    }
  }

  if (tableParentId && tableParents && tableParents[1] !== tableParentId) {
    return new Err({
      type: "invalid_request_error",
      message: "Invalid request body, parents[1] and parent_id should be equal",
    });
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const tableRes = await coreAPI.upsertTable({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    tableId,
    name: tableName,
    description: tableDescription,
    timestamp: tableTimestamp,
    tags: tableTags,
    parentId: tableParentId,
    parents: tableParents,
    title,
    mimeType,
    sourceUrl,
  });

  if (tableRes.isErr()) {
    const errorDetails = {
      type: "internal_server_error" as const,
      coreAPIError: tableRes.error,
      message: "Failed to upsert table.",
    };
    logger.error(
      {
        ...errorDetails,
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        dataSourceName: dataSource.name,
        workspaceId: owner.id,
        tableId,
        tableName,
      },
      "Error upserting table in CoreAPI."
    );
    return new Err(errorDetails);
  }

  if (file) {
    const csvRes = await coreAPI.tableUpsertCSVContent({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      tableId,
      bucket: file.getBucketForVersion("processed").name,
      bucketCSVPath: file.getCloudStoragePath(auth, "processed"),
      truncate,
    });

    if (csvRes.isErr()) {
      const errorDetails = {
        type: "internal_server_error" as const,
        coreAPIError: csvRes.error,
        message: "Failed to upsert CSV.",
      };
      logger.error(
        {
          ...errorDetails,
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
          dataSourceName: dataSource.name,
          workspaceId: owner.id,
          tableId,
          tableName,
        },
        "Error upserting CSV in CoreAPI."
      );

      const delRes = await coreAPI.deleteTable({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        tableId,
      });

      if (delRes.isErr()) {
        logger.error(
          {
            type: "internal_server_error",
            coreAPIError: delRes.error,
            projectId: dataSource.dustAPIProjectId,
            dataSourceId: dataSource.dustAPIDataSourceId,
            dataSourceName: dataSource.name,
            workspaceId: owner.id,
            tableId,
            tableName,
          },
          "Failed to delete table after failed CSV upsert."
        );
      }
      return new Err(errorDetails);
    }
  }

  return tableRes;
}
