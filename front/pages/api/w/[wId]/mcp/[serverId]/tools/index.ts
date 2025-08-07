import type { NextApiRequest, NextApiResponse } from "next";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetMCPServerToolsSettingsResponseBody = {
  toolsSettings: {
    [toolId: string]: {
      permission: MCPToolStakeLevelType;
      enabled: boolean;
    };
  };
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetMCPServerToolsSettingsResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const { serverId } = req.query;

  if (typeof serverId !== "string") {
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
    case "GET": {
      const { serverType, id } = getServerTypeAndIdFromSId(serverId);

      const resources =
        await RemoteMCPServerToolMetadataResource.fetchByServerId(
          auth,
          id,
          serverType
        );

      const toolsSettings = resources.reduce(
        (
          acc: {
            [key: string]: {
              permission: MCPToolStakeLevelType;
              enabled: boolean;
            };
          },
          resource
        ) => {
          acc[resource.toolName] = {
            permission: resource.permission,
            enabled: resource.enabled,
          };
          return acc;
        },
        {}
      );
      return res.status(200).json({ toolsSettings });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET expected.",
        },
      });
  }
}
export default withSessionAuthenticationForWorkspace(handler);
