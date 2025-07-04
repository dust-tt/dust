import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { DefaultRemoteMCPServerInMemoryResource } from "@app/lib/resources/default_remote_mcp_server_in_memory_resource";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetMCPServersResponseBody = {
  success: boolean;
  servers: MCPServerType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMCPServersResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { method } = req;

  switch (method) {
    case "GET": {
      // Get internal servers
      const internalServers = (
        await InternalMCPServerInMemoryResource.listAvailableInternalMCPServers(
          auth
        )
      ).map((r) => r.toJSON());

      // Get default remote servers
      const defaultRemoteServers = (
        await DefaultRemoteMCPServerInMemoryResource.listAvailableDefaultRemoteMCPServers(
          auth
        )
      ).map((r) => r.toJSON());

      return res.status(200).json({
        success: true,
        servers: [...internalServers, ...defaultRemoteServers],
      });
    }

    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
