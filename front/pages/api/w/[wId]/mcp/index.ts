import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  DEFAULT_MCP_SERVER_ICON,
  isCustomServerIconType,
} from "@app/lib/actions/mcp_icons";
import {
  allowsMultipleInstancesOfInternalMCPServerByName,
  isInternalMCPServerName,
  isInternalMCPServerOfName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { DEFAULT_REMOTE_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import { fetchRemoteServerMetaDataByURL } from "@app/lib/actions/mcp_metadata";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import type { MCPServerType, MCPServerTypeWithViews } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { getOAuthConnectionAccessToken } from "@app/types/oauth/client/access_token";

export type GetMCPServersResponseBody = {
  success: true;
  servers: MCPServerTypeWithViews[];
};

export type CreateMCPServerResponseBody = {
  success: true;
  server: MCPServerType;
};

const PostQueryParamsSchema = t.union([
  t.type({
    serverType: t.literal("remote"),
    url: t.string,
    includeGlobal: t.union([t.boolean, t.undefined]),
    sharedSecret: t.union([t.string, t.undefined]),
    useCase: t.union([
      t.literal("platform_actions"),
      t.literal("personal_actions"),
      t.undefined,
    ]),
    connectionId: t.union([t.string, t.undefined]),
  }),
  t.type({
    serverType: t.literal("internal"),
    name: t.string,
    useCase: t.union([
      t.literal("platform_actions"),
      t.literal("personal_actions"),
      t.undefined,
    ]),
    connectionId: t.union([t.string, t.undefined]),
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
              await MCPServerViewResource.listByMCPServer(auth, server.sId)
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
        const { url, sharedSecret } = body;

        if (!url) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "URL is required",
            },
          });
        }

        // Default to the shared secret if it exists.
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        let bearerToken = sharedSecret || null;
        let authorization: AuthorizationInfo | null = null;

        // If a connectionId is provided, we use it to fetch the access token that must have been created by the admin.
        if (body.connectionId) {
          const token = await getOAuthConnectionAccessToken({
            config: apiConfig.getOAuthAPIConfig(),
            logger,
            connectionId: body.connectionId,
          });
          if (token.isOk()) {
            bearerToken = token.value.access_token;
            authorization = {
              provider: token.value.connection.provider,
              supported_use_cases: ["platform_actions", "personal_actions"],
            };
          } else {
            // We fail early if the connectionId is provided but the access token cannot be fetched.
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "Error fetching OAuth connection access token",
              },
            });
          }
        }

        const r = await fetchRemoteServerMetaDataByURL(
          auth,
          url,
          bearerToken
            ? {
                Authorization: `Bearer ${bearerToken}`,
              }
            : undefined
        );
        if (r.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Error fetching remote server metadata: ${r.error.message}`,
            },
          });
        }

        const metadata = r.value;

        const defaultConfig = DEFAULT_REMOTE_MCP_SERVERS.find(
          (config) => config.url === url
        );

        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const name = defaultConfig?.name || metadata.name;

        const newRemoteMCPServer = await RemoteMCPServerResource.makeNew(auth, {
          workspaceId: auth.getNonNullableWorkspace().id,
          url: url,
          cachedName: name,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          cachedDescription: defaultConfig?.description || metadata.description,
          cachedTools: metadata.tools,
          icon:
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            defaultConfig?.icon ||
            (isCustomServerIconType(metadata.icon)
              ? metadata.icon
              : DEFAULT_MCP_SERVER_ICON),
          version: metadata.version,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          sharedSecret: sharedSecret || null,
          authorization,
          oAuthUseCase: body.useCase ?? null,
        });

        if (body.connectionId) {
          // We create a connection to the remote MCP server to allow the user to use the MCP server in the future.
          // The connexion is of type "workspace" because it is created by the admin.
          // If the server can use personal connections, we rely on this "workspace" connection to get the related credentials.
          await MCPServerConnectionResource.makeNew(auth, {
            connectionId: body.connectionId,
            connectionType: "workspace",
            serverType: "remote",
            remoteMCPServerId: newRemoteMCPServer.id,
          });
        }

        // Create default tool stakes if specified
        if (defaultConfig?.toolStakes) {
          for (const [toolName, stakeLevel] of Object.entries(
            defaultConfig.toolStakes
          )) {
            await RemoteMCPServerToolMetadataResource.makeNew(auth, {
              remoteMCPServerId: newRemoteMCPServer.id,
              toolName,
              permission: stakeLevel,
              enabled: true,
            });
          }
        }

        if (body.includeGlobal) {
          const systemView =
            await MCPServerViewResource.getMCPServerViewForSystemSpace(
              auth,
              newRemoteMCPServer.sId
            );

          if (!systemView) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message:
                  "Missing system view for remote MCP server, it should have been created when creating the remote server.",
              },
            });
          }

          const globalSpace =
            await SpaceResource.fetchWorkspaceGlobalSpace(auth);

          await MCPServerViewResource.create(auth, {
            systemView,
            space: globalSpace,
          });
        }

        return res.status(201).json({
          success: true,
          server: newRemoteMCPServer.toJSON(),
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

        if (!allowsMultipleInstancesOfInternalMCPServerByName(name)) {
          const installedMCPServers =
            await MCPServerViewResource.listForSystemSpace(auth, {
              where: {
                serverType: "internal",
              },
            });

          const alreadyUsed = installedMCPServers.some((mcpServer) =>
            isInternalMCPServerOfName(mcpServer.internalMCPServerId, name)
          );

          if (alreadyUsed) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message:
                  "This internal tool has already been added and only one instance is allowed.",
              },
            });
          }
        }

        const newInternalMCPServer =
          await InternalMCPServerInMemoryResource.makeNew(auth, {
            name,
            useCase: body.useCase ?? null,
          });

        if (body.connectionId) {
          // We create a connection to the internal MCP server to allow the user to use the MCP server in the future.
          // The connexion is of type "workspace" because it is created by the admin.
          // If the server can use personal connections, we rely on this "workspace" connection to get the related credentials.
          await MCPServerConnectionResource.makeNew(auth, {
            connectionId: body.connectionId,
            connectionType: "workspace",
            serverType: "internal",
            internalMCPServerId: newInternalMCPServer.id,
          });
        }

        if (body.includeGlobal) {
          const globalSpace =
            await SpaceResource.fetchWorkspaceGlobalSpace(auth);

          const systemView =
            await MCPServerViewResource.getMCPServerViewForSystemSpace(
              auth,
              newInternalMCPServer.id
            );

          if (!systemView) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message:
                  "Missing system view for internal MCP server, it should have been created when creating the internal server.",
              },
            });
          }

          await MCPServerViewResource.create(auth, {
            systemView,
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
