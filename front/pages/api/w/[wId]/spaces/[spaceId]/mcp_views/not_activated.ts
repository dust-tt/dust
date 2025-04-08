import { removeNulls } from "@dust-tt/client";
import _ from "lodash";
import type { NextApiRequest, NextApiResponse } from "next";

import type { MCPServerViewType } from "@app/lib/actions/mcp_metadata";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
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

  if (method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected",
      },
    });
  }

  const workspaceServerViews =
    await MCPServerViewResource.listByWorkspace(auth);
  const spaceServerViews = await MCPServerViewResource.listBySpace(auth, space);

  const serverViews = _.uniqBy(
    _.differenceWith(workspaceServerViews, spaceServerViews, (a, b) => {
      return (
        (a.internalMCPServerId ?? a.remoteMCPServerId) ===
        (b.internalMCPServerId ?? b.remoteMCPServerId)
      );
    }),
    (s) => s.internalMCPServerId ?? s.remoteMCPServerId
  );

  return res.status(200).json({
    success: true,
    serverViews: removeNulls(
      serverViews.map((s) => {
        // TODO: update
        try {
          return s.toJSON();
        } catch (err) {
          return null;
        }
      })
    ),
  });
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { space: { requireCanRead: true } })
);
