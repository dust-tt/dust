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
import { apiError } from "@app/logger/withlogging";
import type { FileType, WithAPIErrorResponse } from "@app/types";
import logger from "@app/logger/logger";

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

function handlePublicErrorResponse(
  req: any,
  res: any,
  error: {
    name: string;
    code:
      | "internal_server_error"
      | "invalid_request_error"
      | "file_too_large"
      | "file_type_not_supported"
      | "unauthorized"
      | "quota_exceeded"
      | "resource_not_found"
      | "processing_failed"
      | "validation_error";
    message: string;
  }
) {
  switch (error.code) {
    case "validation_error":
    case "invalid_request_error":
      logger.error(
        { panic: false, error },
        "Invalid request parameters or validation failure."
      );
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });

    case "unauthorized":
      logger.error(
        { panic: false, error },
        "Unauthorized access attempt during file processing."
      );
      return apiError(req, res, {
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message: error.message,
        },
      });

    case "resource_not_found":
      logger.error(
        { panic: false, error },
        "Required resource not found during file processing."
      );
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: error.message,
        },
      });

    case "file_type_not_supported":
      logger.error(
        { panic: false, error },
        "Unsupported file type for processing."
      );
      return apiError(req, res, {
        status_code: 415,
        api_error: {
          type: "file_type_not_supported",
          message: error.message,
        },
      });

    case "file_too_large":
    case "quota_exceeded":
      logger.error(
        { panic: false, error },
        "File size or quota limits exceeded."
      );
      return apiError(req, res, {
        status_code: 413,
        api_error: {
          type: "file_too_large",
          message: error.message,
        },
      });

    case "processing_failed":
      logger.error(
        { panic: true, error },
        "File processing failed unexpectedly."
      );
      return apiError(req, res, {
        status_code: 422,
        api_error: {
          type: "data_source_error",
          message: error.message,
        },
      });

    case "internal_server_error":
    default:
      logger.error(
        { panic: true, error },
        "Internal server error during file processing."
      );
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "An unexpected error occurred while processing your file.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
