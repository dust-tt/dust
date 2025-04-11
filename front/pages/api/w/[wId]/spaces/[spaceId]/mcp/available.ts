import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerType } from "@app/lib/api/mcp";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
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
    // - installed in the workspace but not in global (so can be restricted but not yet assign to spaces)
    // - not in the current space
    case "GET": {
      const workspaceServerViews =
        await MCPServerViewResource.listByWorkspace(auth);
      const globalServersId = workspaceServerViews
        .filter((s) => s.space.kind === "global")
        .map((s) => s.toJSON().server.id);

      const workspaceInstalledServer =
        await InternalMCPServerInMemoryResource.listByWorkspace(auth);

      const spaceServerViews = await MCPServerViewResource.listBySpace(
        auth,
        space
      );
      const spaceServersId = spaceServerViews.map((s) => s.toJSON().server.id);

      const availableServer = workspaceInstalledServer.filter(
        (s) => !spaceServersId.includes(s.id) && !globalServersId.includes(s.id)
      );

      return res.status(200).json({
        success: true,
        servers: availableServer.map((s) => s.toJSON()),
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
