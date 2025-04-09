import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/assistant/actions/remote_mcp_server_tool_metadata";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { apiError } from "@app/logger/withlogging";
import { WithAPIErrorResponse } from "@app/types";
import { de } from "@faker-js/faker";
import { NextApiRequest, NextApiResponse } from "next";

export type PatchMCPServerToolsPermissionsResponseBody = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PatchMCPServerToolsPermissionsResponseBody>
  >,
  auth: Authenticator
) {
  const { serverId, toolName } = req.query;

  if (typeof serverId !== "string" || typeof toolName !== "string") {
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
    case "PATCH": {
      const { serverType, id } = getServerTypeAndIdFromSId(serverId);
      if (!id) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid server ID.",
          },
        });
      }

      switch (serverType) {
        case "internal":
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Internal MCP server does not support editing tool permissions.",
            },
          });
        case "remote": {
          const { permission } = req.body;
          if (!permission) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "Permission is required.",
              },
            });
          }

          await RemoteMCPServerToolMetadataResource.updateOrCreatePermission(
            auth,
            {
              serverId: id,
              toolName,
              permission: permission as MCPToolStakeLevelType,
            }
          );
          return res.status(200).json({ success: true });
        }
        default:
          return apiError(req, res, {
            status_code: 405,
            api_error: {
              type: "invalid_request_error",
              message: "Method not allowed.",
            },
          });
      }
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
