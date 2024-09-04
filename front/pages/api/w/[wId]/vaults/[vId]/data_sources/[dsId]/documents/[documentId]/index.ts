import type {
  CoreAPILightDocument,
  DocumentType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import {
  CoreAPI,
  PostDataSourceDocumentRequestBodySchema,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import apiConfig from "@app/lib/api/config";
import { upsertDocument } from "@app/lib/api/data_sources";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { isManaged, isWebsite } from "@app/lib/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

export type PatchDocumentResponseBody = {
  document: DocumentType | CoreAPILightDocument;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PatchDocumentResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { documentId, dsId, vId } = req.query;

  if (
    typeof dsId !== "string" ||
    typeof vId !== "string" ||
    typeof documentId !== "string"
  ) {
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
    case "PATCH":
      if (!dataSource.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You are not allowed to update data in this data source.",
          },
        });
      }

      if (isManaged(dataSource) || isWebsite(dataSource)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You cannot upsert a document on a managed data source.",
          },
        });
      }

      const bodyValidation = PostDataSourceDocumentRequestBodySchema.decode(
        req.body
      );

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
        name: documentId,
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

      res.status(200).json({
        document: upsertResult.value.document,
      });
      return;

    case "DELETE":
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
            message: "You cannot delete a document from a managed data source.",
          },
        });
      }

      const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);

      const deleteRes = await coreAPI.deleteDataSourceDocument({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        documentId,
      });

      if (deleteRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "There was an error deleting the document.",
            data_source_error: deleteRes.error,
          },
        });
      }

      res.status(204).end();
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
