import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { isInternalMCPServerName } from "@app/lib/actions/mcp_internal_actions";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import { fetchRemoteServerMetaDataByURL } from "@app/lib/actions/mcp_metadata";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import type { MCPServerViewType } from "@app/lib/resources/mcp_server_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

const allowedFiltersSchema = t.union([
  t.literal("internal"),
  t.literal("remote"),
  t.literal("all"),
]);

export type AllowedFilter = t.TypeOf<typeof allowedFiltersSchema>;

const QueryParamsSchema = t.type({
  filter: allowedFiltersSchema,
});

export type GetMCPServersQueryParams = t.TypeOf<typeof QueryParamsSchema>;

export type GetMCPServersResponseBody = {
  success: boolean;
  servers: (MCPServerType & { views?: MCPServerViewType[] })[];
};

export type CreateMCPServerResponseBody = {
  success: boolean;
  server: MCPServerType;
};

const PostQueryParamsSchema = t.union([
  t.type({
    serverType: t.literal("remote"),
    url: t.string,
  }),
  t.type({
    serverType: t.literal("internal"),
    name: t.string,
  }),
]);

async function getMCPServers(auth: Authenticator, filter: AllowedFilter) {
  switch (filter) {
    case "internal": {
      return InternalMCPServerInMemoryResource.listByWorkspace(auth, true);
    }

    case "remote": {
      return RemoteMCPServerResource.listByWorkspace(auth);
    }

    case "all":
      const remoteMCPs = await RemoteMCPServerResource.listByWorkspace(auth);
      const internalMCPs =
        await InternalMCPServerInMemoryResource.listByWorkspace(auth, true);

      return [...remoteMCPs, ...internalMCPs];
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetMCPServersResponseBody | CreateMCPServerResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const { method } = req;

  switch (method) {
    case "GET": {
      const r = QueryParamsSchema.decode(req.query);

      if (isLeft(r)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid query parameters.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        servers: await concurrentExecutor(
          await getMCPServers(auth, r.right.filter),
          async (r) => {
            const server = await r.toJSON(auth);
            const views = (
              await MCPServerViewResource.listByMCPServer(auth, server.id)
            ).map((v) => ({
              id: v.sId,
              createdAt: v.createdAt,
              updatedAt: v.updatedAt,
              spaceId: v.space.sId,
              server,
            }));
            return { ...server, views };
          },
          {
            concurrency: 10,
          }
        ),
      });
      break;
    }
    case "POST": {
      const r = PostQueryParamsSchema.decode(req.body);

      if (isLeft(r)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body",
          },
        });
      }

      const body = r.right;
      if (body.serverType === "remote") {
        const { url } = body;

        if (!url) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "URL is required",
            },
          });
        }

        const existingServer = await RemoteMCPServerResource.findByUrl(
          auth,
          url
        );

        if (existingServer) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "A server with this URL already exists",
            },
          });
        }

        const metadata = await fetchRemoteServerMetaDataByURL(auth, url);

        const newRemoteMCPServer = await RemoteMCPServerResource.makeNew(auth, {
          workspaceId: auth.getNonNullableWorkspace().id,
          name: metadata.name,
          url: url,
          description: metadata.description,
          cachedTools: metadata.tools,
        });

        return res.status(201).json({
          success: true,
          server: {
            ...metadata,
            id: newRemoteMCPServer.sId,
          },
        });
      } else {
        const { name } = body;

        if (!isInternalMCPServerName(name)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid internal MCP server name",
            },
          });
        }

        const internalMCPServerId = InternalMCPServerInMemoryResource.nameToSId(
          {
            name,
            workspaceId: auth.getNonNullableWorkspace().id,
          }
        );

        const existingServer =
          await InternalMCPServerInMemoryResource.fetchById(
            auth,
            internalMCPServerId
          );

        if (existingServer) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "A server with this URL already exists",
            },
          });
        }

        const newInternalMCPServer =
          await InternalMCPServerInMemoryResource.makeNew(auth, name);

        return res.status(201).json({
          success: true,
          server: await newInternalMCPServer.toJSON(auth),
        });
      }
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
