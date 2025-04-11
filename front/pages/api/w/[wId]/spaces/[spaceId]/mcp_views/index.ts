import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { SpaceKind, WithAPIErrorResponse } from "@app/types";

export type GetMCPServerViewsResponseBody = {
  success: boolean;
  serverViews: MCPServerViewType[];
};

export type PostMCPServerViewResponseBody = {
  success: boolean;
  serverView: MCPServerViewType;
};

const PostQueryParamsSchema = t.type({
  mcpServerId: t.string,
});

export type PostMCPServersQueryParams = t.TypeOf<typeof PostQueryParamsSchema>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetMCPServerViewsResponseBody | PostMCPServerViewResponseBody
    >
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const { method } = req;

  switch (method) {
    case "GET": {
      const mcpServerViews = await MCPServerViewResource.listBySpace(
        auth,
        space
      );
      return res.status(200).json({
        success: true,
        serverViews: mcpServerViews
          .map((mcpServerView) => mcpServerView.toJSON())
          .filter((s) => !s.server.isDefault),
      });
    }
    case "POST": {
      const r = PostQueryParamsSchema.decode(req.body);

      if (isLeft(r)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid query parameters.",
          },
        });
      }

      const { mcpServerId } = r.right;

      const allowedSpaceKinds: SpaceKind[] = ["regular", "global"];
      if (!allowedSpaceKinds.includes(space.kind)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Can only create MCP Server Views from regular or global spaces.",
          },
        });
      }

      const mcpServerView = await MCPServerViewResource.create(auth, {
        mcpServerId,
        space,
      });

      return res.status(200).json({
        success: true,
        serverView: mcpServerView.toJSON(),
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
