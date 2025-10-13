import _ from "lodash";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { removeNulls } from "@app/types";

export type GetMCPServerViewsNotActivatedResponseBody = {
  success: boolean;
  serverViews: MCPServerViewType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetMCPServerViewsNotActivatedResponseBody>
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const { method } = req;

  switch (method) {
    case "GET": {
      const spaceMcpServerViews = await MCPServerViewResource.listBySpace(
        auth,
        space
      );

      const workspaceServerViews =
        await MCPServerViewResource.listByWorkspace(auth);

      // MCP servers that can be added to a space are the ones that have been activated by the admin
      // (they are in the system space) but are not already in the company space (not in the global
      // space). Note that this leaks system mcpServerView ids (not ideal but OK since they are
      // enumerable). We also want to make sure we're not taking the MCPServerViews
      const systemMcpServerViews = workspaceServerViews.filter(
        (s) => s.space.kind === "system"
      );
      const globalMcpServerViews = workspaceServerViews.filter(
        (s) => s.space.kind === "global"
      );

      const activablemcpServerViews = _.differenceWith(
        systemMcpServerViews,
        spaceMcpServerViews.concat(globalMcpServerViews),
        (a, b) => {
          return (
            (a.internalMCPServerId ?? a.remoteMCPServerId) ===
            (b.internalMCPServerId ?? b.remoteMCPServerId)
          );
        }
      );

      return res.status(200).json({
        success: true,
        serverViews: removeNulls(
          activablemcpServerViews.map((s) => s.toJSON())
        ),
      });
    }
    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { space: { requireCanRead: true } })
);
