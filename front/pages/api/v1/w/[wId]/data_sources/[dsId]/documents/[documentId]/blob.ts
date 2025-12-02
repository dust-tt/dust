import type { GetDocumentBlobResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { CoreAPI } from "@app/types";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

/**
 * @ignoreswagger
 * Only used by connectors.
 */
async function handler(
  req: NextApiRequest,
  // eslint-disable-next-line dust/enforce-client-types-in-public-api
  res: NextApiResponse<WithAPIErrorResponse<GetDocumentBlobResponseType>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  }

  const { documentId, dsId } = req.query;
  if (typeof documentId !== "string" || typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource || !dataSource.canRead(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (dataSource.space.kind === "conversations") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you're trying to access was not found",
      },
    });
  }

  const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
  switch (req.method) {
    case "GET":
      const blobRes = await coreAPI.getDataSourceDocumentBlob({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        documentId,
      });

      if (
        blobRes.isErr() &&
        blobRes.error.code === "data_source_document_not_found"
      ) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_document_not_found",
            message: "The data source document you requested was not found.",
          },
        });
      }

      if (blobRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "data_source_error",
            message:
              "There was an error retrieving the data source document blob.",
            data_source_error: blobRes.error,
          },
        });
      }

      res.status(200).json({
        blob: blobRes.value,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, POST, or DELETE is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);
