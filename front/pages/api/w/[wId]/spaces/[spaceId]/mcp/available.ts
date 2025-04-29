import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerType } from "@app/lib/api/mcp";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetMCPServersResponseBody = {
  success: boolean;
  servers: MCPServerType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMCPServersResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const { method } = req;

  switch (method) {
    // We get the server that are:
    // - not in global (so can be restricted but not yet assign to spaces)
    // - not in the current space
    case "GET": {
      const [
        internalInstalledServers,
        remoteInstalledServers,
        workspaceServerViews,
      ] = await Promise.all([
        InternalMCPServerInMemoryResource.listByWorkspace(auth),
        RemoteMCPServerResource.listByWorkspace(auth),
        MCPServerViewResource.listByWorkspace(auth),
      ]);

      const globalServersId = workspaceServerViews
        .filter((s) => s.space.kind === "global")
        .map((s) => s.toJSON().server.id);

      const spaceServerViews = workspaceServerViews.filter(
        (s) => s.space.id === space.id
      );
      const spaceServersId = spaceServerViews.map((s) => s.toJSON().server.id);

      const availableServer: MCPServerType[] = [];

      for (const srv of internalInstalledServers) {
        if (
          !spaceServersId.includes(srv.id) &&
          !globalServersId.includes(srv.id)
        ) {
          availableServer.push(srv.toJSON());
        }
      }

      for (const srv of remoteInstalledServers) {
        if (
          !spaceServersId.includes(srv.sId) &&
          !globalServersId.includes(srv.sId)
        ) {
          availableServer.push(srv.toJSON());
        }
      }

      return res.status(200).json({
        success: true,
        servers: availableServer,
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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { space: { requireCanRead: true } })
);
