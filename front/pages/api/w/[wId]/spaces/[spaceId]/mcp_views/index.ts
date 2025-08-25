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

const GetQueryParamsSchema = t.type({
  availability: t.union([
    t.undefined,
    t.literal("manual"),
    t.literal("auto"),
    t.literal("auto_hidden_builder"),
    t.literal("all"),
  ]),
});

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
      const r = GetQueryParamsSchema.decode(req.query);

      if (isLeft(r)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid query parameters.",
          },
        });
      }

      const { availability = "manual" } = r.right;

      const mcpServerViews = await MCPServerViewResource.listBySpace(
        auth,
        space
      );
      return res.status(200).json({
        success: true,
        serverViews: mcpServerViews
          .map((mcpServerView) => mcpServerView.toJSON())
          .filter(
            (s) =>
              availability === "all" || s.server.availability === availability
          ),
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

      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "mcp_auth_error",
            message: "User is not authorized to add tools to a space.",
          },
        });
      }

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

      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          auth,
          mcpServerId
        );

      if (!systemView) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Missing system view for MCP server, it should have been created when adding the tool.",
          },
        });
      }

      const mcpServerView = await MCPServerViewResource.create(auth, {
        systemView,
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
