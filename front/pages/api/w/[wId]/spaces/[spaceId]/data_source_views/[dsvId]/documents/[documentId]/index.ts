import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { CoreAPI } from "@app/types/core/core_api";
import type { CoreAPIDocument } from "@app/types/core/data_source";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

// Next.js config requires literal values (static analysis). 16MB accommodates 5MB document content
// (MAX_LARGE_DOCUMENT_TXT_LEN in connectors) plus ~3x JSON encoding overhead for escaping.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "16mb",
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
  auth: Authenticator,
  { dataSourceView }: { dataSourceView: DataSourceViewResource }
): Promise<void> {
  const { documentId } = req.query;
  if (typeof documentId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid document id.",
      },
    });
  }
  if (!dataSourceView.canRead(auth)) {
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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    dataSourceView: { requireCanRead: true },
  })
);
