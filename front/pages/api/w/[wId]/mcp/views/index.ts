import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetMCPServerViewsListResponseBody = {
  success: boolean;
  serverViews: MCPServerViewType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMCPServerViewsListResponseBody>>,
  auth: Authenticator
) {
  const { method } = req;

  switch (method) {
    case "GET": {
      const spaceIds = req.query.spaceIds;
      if (!spaceIds || typeof spaceIds !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid query parameters",
          },
        });
      }

      const serverViews = await concurrentExecutor(
        spaceIds.split(","),
        async (spaceId) => {
          const space = await SpaceResource.fetchById(auth, spaceId);
          if (!space) {
            return null;
          }
          const views = await MCPServerViewResource.listBySpace(auth, space);
          return views.map((v) => v.toJSON());
        },
        { concurrency: 10 }
      );

      const flattenedServerViews = serverViews
        .flat()
        .filter((v): v is MCPServerViewType => v !== null)
        .filter((v) => v.server.isDefault === false);

      return res.status(200).json({
        success: true,
        serverViews: flattenedServerViews,
      });
    }
    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Method not supported",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
