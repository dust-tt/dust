import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import {
  DEFAULT_MCP_SERVER_ICON,
  isRemoteAllowedIconType,
} from "@app/lib/actions/mcp_icons";
import { isInternalMCPServerName } from "@app/lib/actions/mcp_internal_actions/constants";
import { fetchRemoteServerMetaDataByURL } from "@app/lib/actions/mcp_metadata";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerType, MCPServerTypeWithViews } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type GetMCPServersResponseBody = {
  success: boolean;
  servers: MCPServerTypeWithViews[];
};

export type CreateMCPServerResponseBody = {
  success: boolean;
  server: MCPServerType;
};

const PostQueryParamsSchema = t.union([
  t.type({
    serverType: t.literal("remote"),
    url: t.string,
    includeGlobal: t.union([t.boolean, t.undefined]),
  }),
  t.type({
    serverType: t.literal("internal"),
    name: t.string,
    includeGlobal: t.union([t.boolean, t.undefined]),
  }),
]);

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
      const remoteMCPs = await RemoteMCPServerResource.listByWorkspace(auth);
      const internalMCPs =
        await InternalMCPServerInMemoryResource.listByWorkspace(auth);

      const servers = [...remoteMCPs, ...internalMCPs].sort((a, b) =>
        a.toJSON().name.localeCompare(b.toJSON().name)
      );

      return res.status(200).json({
        success: true,
        servers: await concurrentExecutor(
          servers,
          async (r) => {
            const server = r.toJSON();
            const views = (
              await MCPServerViewResource.listByMCPServer(auth, server.id)
            ).map((v) => v.toJSON());
            return { ...server, views };
          },
          {
            concurrency: 10,
          }
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

        const r = await fetchRemoteServerMetaDataByURL(auth, url);
        if (r.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Error fetching remote server metadata, URL may be invalid.",
            },
          });
        }

        const metadata = r.value;

        const newRemoteMCPServer = await RemoteMCPServerResource.makeNew(auth, {
          workspaceId: auth.getNonNullableWorkspace().id,
          url: url,
          cachedName: metadata.name,
          cachedDescription: metadata.description,
          cachedTools: metadata.tools,
          icon: isRemoteAllowedIconType(metadata.icon)
            ? metadata.icon
            : DEFAULT_MCP_SERVER_ICON,
          version: metadata.version,
        });

        if (body.includeGlobal) {
          const globalSpace =
            await SpaceResource.fetchWorkspaceGlobalSpace(auth);

          await MCPServerViewResource.create(auth, {
            mcpServerId: newRemoteMCPServer.sId,
            space: globalSpace,
          });
        }

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

        const internalMCPServerId = internalMCPServerNameToSId({
          name,
          workspaceId: auth.getNonNullableWorkspace().id,
        });

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

        if (body.includeGlobal) {
          const globalSpace =
            await SpaceResource.fetchWorkspaceGlobalSpace(auth);

          await MCPServerViewResource.create(auth, {
            mcpServerId: newInternalMCPServer.id,
            space: globalSpace,
          });
        }

        return res.status(201).json({
          success: true,
          server: newInternalMCPServer.toJSON(),
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
