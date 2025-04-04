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

  // Only folder document, document and table upserts are supported on this endpoint.
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
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
