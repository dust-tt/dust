import type {
  ConnectorPermission,
  GetDataSourceViewContentResponseBody,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSourceContent } from "@app/lib/api/vaults";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";

// TODO(2024-08-29 flav) Remove `filterPermission` from here once front-end is updated.
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetDataSourceViewContentResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const dataSourceView = await DataSourceViewResource.fetchById(
    auth,
    req.query.dsvId as string
  );

  if (
    !dataSourceView ||
    req.query.vId !== dataSourceView.vault.sId ||
    !dataSourceView.canRead(auth)
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_view_not_found",
        message: "The data source view you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const viewType = req.query.viewType;
      if (
        !viewType ||
        typeof viewType !== "string" ||
        (viewType !== "tables" && viewType !== "documents")
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid viewType. Required: tables | documents",
          },
        });
      }

      let parentId: string | null = null;
      if (req.query.parentId && typeof req.query.parentId === "string") {
        parentId = req.query.parentId;
      }
      const limit = req.query.limit
        ? Math.min(200, parseInt(req.query.limit as string))
        : 10;
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
        : 0;

      let filterPermission: ConnectorPermission | undefined = undefined;
      if (
        req.query.filterPermission &&
        typeof req.query.filterPermission === "string"
      ) {
        switch (req.query.filterPermission) {
          case "read":
            filterPermission = "read";
            break;
          case "write":
            filterPermission = "write";
            break;
        }
      }

      const contentRes = await getDataSourceContent(
        auth,
        dataSourceView.dataSource,
        filterPermission,
        viewType,
        dataSourceView.parentsIn,
        parentId,
        { limit, offset }
      );

      if (contentRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `An error occurred while retrieving the data source permissions.`,
          },
        });
      }

      return res.status(200).json({
        nodes: contentRes.value,
      });

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
