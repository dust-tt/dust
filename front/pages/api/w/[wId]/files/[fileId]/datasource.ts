import type { FileType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest } from "next";
import type { NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type {
  UpsertDocumentArgs,
  UpsertTableArgs,
} from "@app/lib/api/data_sources";
import {
  getOrCreateJitDataSourceForFile,
  processAndUpsertToDataSource,
} from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { apiError } from "@app/logger/withlogging";

export interface UpsertFileToDataSourceRequestBody {
  dataSourceId: string;
  upsertArgs:
    | Pick<UpsertDocumentArgs, "name" | "title" | "parents" | "tags">
    | Pick<
        UpsertTableArgs,
        | "name"
        | "title"
        | "parents"
        | "tags"
        | "description"
        | "tableId"
        | "useAppForHeaderDetection"
      >;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<{ file: FileType }>>,
  auth: Authenticator
): Promise<void> {
  const { fileId } = req.query;
  if (typeof fileId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing fileId query parameter.",
      },
    });
  }

  // Get file and make sure that it is within the same workspace.
  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const { dataSourceId, upsertArgs } = req.body;

  switch (req.method) {
    case "PUT": {
      let dataSourceToUse: DataSourceResource | null = null;
      // JIT data source.
      if (file.useCase === "conversation") {
        const jitDataSource = await getOrCreateJitDataSourceForFile(auth, file);
        if (jitDataSource.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to get or create JIT data source.",
            },
          });
        }
        dataSourceToUse = jitDataSource.value;
      } else {
        const dataSource = await DataSourceResource.fetchByModelIdWithAuth(
          auth,
          dataSourceId
        );
        if (!dataSource) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "data_source_not_found",
              message: `Could not find data source with id ${dataSourceId}`,
            },
          });
        }
        dataSourceToUse = dataSource;
      }

      const rUpsert = await processAndUpsertToDataSource(
        auth,
        dataSourceToUse,
        { file, upsertArgs: upsertArgs }
      );
      if (rUpsert.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to upsert the file.",
          },
        });
      }
      return res.status(200).json({ file: file.toPublicJSON(auth) });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PUT is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
