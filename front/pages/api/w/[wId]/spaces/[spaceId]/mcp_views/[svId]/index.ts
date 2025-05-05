import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { SpaceKind, WithAPIErrorResponse } from "@app/types";

export type DeleteMCPServerViewResponseBody = {
  deleted: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<DeleteMCPServerViewResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const { svId: serverViewId } = req.query;

  if (typeof serverViewId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "mcp_auth_error",
        message:
          "You are not authorized to make request to inspect an MCP server.",
      },
    });
  }

  switch (req.method) {
    case "DELETE": {
      const mcpServerView = await MCPServerViewResource.fetchById(
        auth,
        serverViewId
      );

      if (!mcpServerView) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "MCP Server View not found",
          },
        });
      }

      if (mcpServerView.space.id !== space.id) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "MCP Server View not found",
          },
        });
      }

      const allowedSpaceKinds: SpaceKind[] = ["regular", "global"];
      if (!allowedSpaceKinds.includes(space.kind)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Can only delete MCP Server Views from regular or global spaces.",
          },
        });
      }

      if (!space.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "mcp_auth_error",
            message: "User is not authorized to remove tools from a space.",
          },
        });
      }
      await mcpServerView.delete(auth, { hardDelete: true });

      return res.status(200).json({
        deleted: true,
      });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, only DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
