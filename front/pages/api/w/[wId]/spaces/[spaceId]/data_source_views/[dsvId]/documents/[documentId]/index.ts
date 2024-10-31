import type { CoreAPIDocument, WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import apiConfig from "@app/lib/api/config";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

export type GetDataSourceViewDocumentResponseBody = {
  document: CoreAPIDocument;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetDataSourceViewDocumentResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const { dsvId, documentId } = req.query;
  if (typeof dsvId !== "string" || typeof documentId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_view_not_found",
        message: "The data source view you requested was not found.",
      },
    });
  }

  const dataSourceView = await DataSourceViewResource.fetchById(auth, dsvId);
  if (!dataSourceView || !dataSourceView.canRead(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_view_not_found",
        message: "The data source view you requested was not found.",
      },
    });
  }
  const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);

  switch (req.method) {
    case "GET":
      const document = await coreAPI.getDataSourceDocument({
        dataSourceId: dataSourceView.dataSource.dustAPIDataSourceId,
        documentId,
        projectId: dataSourceView.dataSource.dustAPIProjectId,
        viewFilter: dataSourceView.toViewFilter(),
      });

      if (document.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "data_source_error",
            message:
              "There was an error retrieving the data source view's document.",
            data_source_error: document.error,
          },
        });
      }

      res.status(200).json({
        document: document.value.document,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
