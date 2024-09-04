import type {
  CoreAPILightDocument,
  DocumentType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { PostDataSourceWithNameDocumentRequestBodySchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { upsertDocument } from "@app/lib/api/data_sources";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

export type PostDocumentResponseBody = {
  document: DocumentType | CoreAPILightDocument;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostDocumentResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { dsId, vId } = req.query;

  if (typeof dsId !== "string" || typeof vId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request query parameters.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchByNameOrId(auth, dsId);

  if (
    !dataSource ||
    vId !== dataSource.vault.sId ||
    !dataSource.canRead(auth)
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      if (!dataSource.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You are not allowed to update data in this data source.",
          },
        });
      }

      if (dataSource.connectorId) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You cannot upsert a document on a managed data source.",
          },
        });
      }

      const bodyValidation =
        PostDataSourceWithNameDocumentRequestBodySchema.decode(req.body);

      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const upsertResult = await upsertDocument({
        ...bodyValidation.right,
        dataSource: dataSource.toJSON(),
        auth,
      });

      if (upsertResult.isErr()) {
        switch (upsertResult.error.code) {
          case "data_source_quota_error":
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "data_source_quota_error",
                message: upsertResult.error.message,
              },
            });
          case "invalid_url":
          case "text_or_section_required":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: upsertResult.error.message,
              },
            });
          default:
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "There was an error upserting the document.",
              },
            });
        }
      }

      res.status(201).json({
        document: upsertResult.value.document,
      });
      return;
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
