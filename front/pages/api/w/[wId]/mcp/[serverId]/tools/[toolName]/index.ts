import type { NextApiRequest, NextApiResponse } from "next";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { CUSTOM_REMOTE_MCP_TOOL_STAKE_LEVELS } from "@app/lib/actions/constants";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { getDefaultRemoteMCPServerByURL } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { assertNever } from "@app/types";

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

          if (!CUSTOM_REMOTE_MCP_TOOL_STAKE_LEVELS.includes(permission)) {
            const remoteMCPServer = await RemoteMCPServerResource.findByPk(
              auth,
              id
            );
            if (!remoteMCPServer) {
              return apiError(req, res, {
                status_code: 404,
                api_error: {
                  type: "data_source_not_found",
                  message: "Remote MCP server not found.",
                },
              });
            }
            const defaultServerConfig = getDefaultRemoteMCPServerByURL(
              remoteMCPServer.url
            );
            if (defaultServerConfig?.toolStakes?.[toolName] !== permission) {
              return apiError(req, res, {
                status_code: 400,
                api_error: {
                  type: "invalid_request_error",
                  message: `The '${permission}' permission is only allowed for tools pre-configured with this setting in default servers.`,
                },
              });
            }
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
          assertNever(serverType);
      }
      break;
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
