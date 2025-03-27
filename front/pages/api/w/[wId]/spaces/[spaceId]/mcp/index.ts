import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import type { MCPServerMetadata } from "@app/lib/actions/mcp_actions";
import { getAllMCPServersMetadataLocally } from "@app/lib/actions/mcp_actions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const QueryParamsSchema = t.type({
  filter: t.union([
    t.literal("internal"),
    t.literal("remote"),
    t.literal("all"),
  ]),
});

export type GetMCPServersResponseBody = {
  success: boolean;
  mcpServers: MCPServerMetadata[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMCPServersResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const { method } = req;
  const r = QueryParamsSchema.decode(req.query);

  if (!space.isSystem()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only system spaces support listing MCP servers.",
      },
    });
  }

  if (isLeft(r)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters.",
      },
    });
  }

  switch (method) {
    case "GET": {
      switch (r.right.filter) {
        case "internal":
          {
            const mcpServers = await getAllMCPServersMetadataLocally(auth);
            return res.status(200).json({
              success: true,
              mcpServers,
            });
          }
          break;
        case "remote":
          throw new Error("Not implemented");
          break;
        case "all":
          const mcpServers = await getAllMCPServersMetadataLocally(auth);
          return res.status(200).json({
            success: true,
            mcpServers,
          });
      }
    }
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanAdministrate: true },
  })
);
