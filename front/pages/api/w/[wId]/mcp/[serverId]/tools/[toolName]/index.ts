import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import {
  CUSTOM_REMOTE_MCP_TOOL_STAKE_LEVELS,
  MCP_TOOL_STAKE_LEVELS,
} from "@app/lib/actions/constants";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { getDefaultRemoteMCPServerByURL } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type PatchMCPServerToolsPermissionsResponseBody = {
  success: boolean;
};

const UpdateMCPToolSettingsBodySchema = z
  .object({
    permission: z.enum(MCP_TOOL_STAKE_LEVELS).optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (data) => data.permission !== undefined || data.enabled !== undefined,
    {
      message: "At least one of 'permission' or 'enabled' must be provided.",
    }
  );

export type UpdateMCPToolSettingsBodyType = z.infer<
  typeof UpdateMCPToolSettingsBodySchema
>;

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
      const r = UpdateMCPToolSettingsBodySchema.safeParse(req.body);
      if (r.error) {
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
          status_code: 400,
        });
      }

      const { permission, enabled } = r.data;

      if (serverType === "remote" && permission !== undefined) {
        if (!CUSTOM_REMOTE_MCP_TOOL_STAKE_LEVELS.includes(permission as any)) {
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
      }

      await RemoteMCPServerToolMetadataResource.updateOrCreateSettings(auth, {
        serverSId: serverId,
        toolName,
        permission: permission ?? "high",
        enabled: enabled ?? true,
      });
      return res.status(200).json({ success: true });
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
