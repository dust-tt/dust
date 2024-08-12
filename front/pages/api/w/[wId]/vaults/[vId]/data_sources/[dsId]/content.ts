import type {
  ContentNodesViewType,
  GetDataSourceOrViewContentResponseBody,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSourceContent } from "@app/lib/api/vaults";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetDataSourceOrViewContentResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you requested was not found.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchByName(
    auth,
    req.query.dsId as string
  );

  const vault = dataSource?.vault;

  if (
    !dataSource ||
    !vault ||
    req.query.vId !== vault.sId ||
    (!auth.isAdmin() && !auth.hasPermission([vault.acl()], "read"))
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
    case "GET":
      const viewType = req.query.viewType as ContentNodesViewType;
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
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
        : 0;

      const contentRes = await getDataSourceContent(
        dataSource,
        viewType,
        null,
        parentId,
        {
          limit,
          offset,
        }
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
