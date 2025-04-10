import { removeNulls } from "@dust-tt/client";
import _ from "lodash";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

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
      const workspaceServerViews =
        await MCPServerViewResource.listByWorkspace(auth);

      const spaceServerViews = await MCPServerViewResource.listBySpace(
        auth,
        space
      );

      const nonCompanyDataServerViews = workspaceServerViews.filter(
        (s) => s.space.kind !== "global" && s.space.kind !== "system"
      );

      // We get the actions that aren't activated in Company Data and not in the space making the request
      const serverViewsNotActivated = _.differenceWith(
        nonCompanyDataServerViews,
        spaceServerViews,
        (a, b) => {
          return (
            (a.internalMCPServerId ?? a.remoteMCPServerId) ===
            (b.internalMCPServerId ?? b.remoteMCPServerId)
          );
        }
      );

      // We can have duplicate because some actions can be activated in many spaces
      const serverViews = _.uniqBy(
        serverViewsNotActivated,
        (s) => s.internalMCPServerId ?? s.remoteMCPServerId
      );

      return res.status(200).json({
        success: true,
        serverViews: removeNulls(
          serverViews.map((s) => {
            // WARN: Probably due to Intenal MCP Server view pointing to `internalMCPServerId` that doesn't exists anymore.
            // Need to think about migration of mcp_server_view when we're updating internal mcp servers.
            try {
              return s.toJSON();
            } catch (err) {
              logger.error(
                {
                  serverViewId: s.sId,
                  workspaceId: s.workspaceId,
                  spaceId: space.sId,
                  userId: auth.getNonNullableUser().id,
                },
                "couldn't toJSON() a mcp_server_view"
              );
              return null;
            }
          })
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
