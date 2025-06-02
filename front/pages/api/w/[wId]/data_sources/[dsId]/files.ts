import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type {
  UpsertDocumentArgs,
  UpsertTableArgs,
} from "@app/lib/api/data_sources";
import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { APIErrorType, FileType, WithAPIErrorResponse } from "@app/types";
import { DustError } from "@app/lib/error";

export interface UpsertFileToDataSourceRequestBody {
  fileId: string;
  upsertArgs?:
    | Pick<UpsertDocumentArgs, "document_id" | "title" | "tags">
    | (Pick<UpsertTableArgs, "name" | "title" | "description" | "tags"> & {
        tableId: string | undefined;
      }); // we actually don't always have a tableId, this is very dirty, but the refactoring should be done at the level of the whole upsertArgs mechanic
}

export interface UpsertFileToDataSourceResponseBody {
  file: FileType;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<{ file: FileType }>>,
  auth: Authenticator
): Promise<void> {
  const { dsId } = req.query;
  if (typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const { fileId, upsertArgs } = req.body;

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

  // Only folder document and table upserts are supported on this endpoint.
  if (
    !["upsert_document", "upsert_table", "folders_document"].includes(
      file.useCase
    )
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Only folder document and table upserts are supported on this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      let dataSourceToUse: DataSourceResource | null = null;

      const dataSource = await DataSourceResource.fetchById(auth, dsId);
      if (!dataSource) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: `Could not find data source with id ${dsId}`,
          },
        });
      }
      dataSourceToUse = dataSource;

      if (!dataSourceToUse.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You are not authorized to upsert to this data source.",
          },
        });
      }

      const rUpsert = await processAndUpsertToDataSource(
        auth,
        dataSourceToUse,
        { file, upsertArgs: upsertArgs }
      );
      if (rUpsert.isErr()) {
        handlePublicErrorResponse(req, res, rUpsert.error);
      }
      return res.status(200).json({ file: file.toPublicJSON(auth) });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

function handlePublicErrorResponse(req: any, res: any, error: DustError) {
  let status_code: number;
  let type: APIErrorType;
  let message: string;
  let panic: boolean;

  switch (error.code) {
    case "file_not_ready":
    case "invalid_file":
    case "title_too_long":
    case "invalid_url":
    case "missing_csv":
    case "invalid_content_error":
      status_code = 400;
      type = "invalid_request_error";
      message = "Invalid request parameters or validation failure.";
      panic = false;
      break;

    case "unauthorized":
      status_code = 401;
      type = "not_authenticated";
      message = "Unauthorized access attempt during file processing.";
      panic = false;
      break;

    case "resource_not_found":
      status_code = 404;
      type = "file_not_found";
      message = "Required resource not found during file processing.";
      panic = false;
      break;

    case "data_source_quota_error":
      status_code = 413;
      type = "file_too_large";
      message = "File size or quota limits exceeded.";
      panic = false;
      break;

    default:
      status_code = 500;
      type = "internal_server_error";
      message = "Internal server error during file processing.";
      panic = true;
      break;
  }

  logger.error({ panic, error }, message);

  return apiError(req, res, {
    status_code,
    api_error: {
      type,
      message,
    },
  });
}

export default withSessionAuthenticationForWorkspace(handler);
