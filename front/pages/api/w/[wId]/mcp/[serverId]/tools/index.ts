import type { NextApiRequest, NextApiResponse } from "next";

import type { RemoteMCPToolStakeLevelType } from "@app/lib/actions/constants";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { assertNever } from "@app/types";

export type GetMCPServerToolsPermissionsResponseBody = {
  permissions: {
    [toolId: string]: RemoteMCPToolStakeLevelType;
  };
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetMCPServerToolsPermissionsResponseBody>
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
      switch (serverType) {
        case "internal":
          return res.status(200).json({ permissions: {} });
        case "remote":
          const resources =
            await RemoteMCPServerToolMetadataResource.fetchByServerId(auth, id);

          const permissions = resources.reduce(
            (acc: { [key: string]: RemoteMCPToolStakeLevelType }, resource) => {
              acc[resource.toolName] = resource.permission;
              return acc;
            },
            {}
          );

          return res.status(200).json({
            permissions,
          });
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
          message: "The method passed is not supported, GET expected.",
        },
      });
  }
}
export default withSessionAuthenticationForWorkspace(handler);
