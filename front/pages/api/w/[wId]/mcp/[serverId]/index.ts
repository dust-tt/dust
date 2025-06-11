import type { NextApiRequest, NextApiResponse } from "next";

import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { apiError } from "@app/logger/withlogging";
import type { MCPOAuthUseCase, Result, WithAPIErrorResponse } from "@app/types";
import { assertNever, Ok } from "@app/types";

export type GetMCPServerResponseBody = {
  server: MCPServerType;
};

export type PatchMCPServerResponseBody = {
  success: boolean;
  server: MCPServerType;
};

export type DeleteMCPServerResponseBody = {
  deleted: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetMCPServerResponseBody
      | PatchMCPServerResponseBody
      | DeleteMCPServerResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const { serverId } = req.query;

  if (typeof serverId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "mcp_auth_error",
        message:
          "You are not authorized to make request to inspect an MCP server.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { serverType, id } = getServerTypeAndIdFromSId(serverId);
      switch (serverType) {
        case "internal": {
          const server = await InternalMCPServerInMemoryResource.fetchById(
            auth,
            serverId
          );

          if (!server) {
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "data_source_not_found",
                message: "Internal MCP Server not found",
              },
            });
          }

          return res.status(200).json({ server: server.toJSON() });
        }
        case "remote": {
          const server = await RemoteMCPServerResource.fetchById(
            auth,
            serverId
          );

          if (!server || server.id !== id) {
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "data_source_not_found",
                message: "Remote MCP Server not found",
              },
            });
          }

          return res.status(200).json({ server: server.toJSON() });
        }
        default:
          assertNever(serverType);
      }
      break;
    }
    case "PATCH": {
      const { serverType } = getServerTypeAndIdFromSId(serverId);
      switch (serverType) {
        case "internal": {
          const server = await InternalMCPServerInMemoryResource.fetchById(
            auth,
            serverId
          );

          if (!server) {
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "mcp_server_not_found",
                message: "Internal MCP Server not found",
              },
            });
          }
          const { oAuthUseCase } = req.body;

          if (!oAuthUseCase) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "OAuth use case is required",
              },
            });
          }

          const r = await updateOAuthUseCaseForMCPServer(auth, {
            mcpServerId: serverId,
            oAuthUseCase,
          });

          if (r.isErr()) {
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: r.error.message,
              },
            });
          }

          return res.status(200).json({
            success: true,
            server: server.toJSON(),
          });

          break;
        }
        case "remote": {
          const server = await RemoteMCPServerResource.fetchById(
            auth,
            serverId
          );

          if (!server) {
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "mcp_server_not_found",
                message: "Remote MCP Server not found",
              },
            });
          }

          const { name, icon, description, sharedSecret, oAuthUseCase } =
            req.body;

          if (
            !name &&
            !icon &&
            !description &&
            !sharedSecret &&
            !oAuthUseCase
          ) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "At least one field to update is required",
              },
            });
          }

          if (name || icon || description || sharedSecret) {
            await server.updateMetadata(auth, {
              name,
              icon,
              description,
              sharedSecret,
              lastSyncAt: new Date(),
            });
          }

          if (oAuthUseCase) {
            const r = await updateOAuthUseCaseForMCPServer(auth, {
              mcpServerId: serverId,
              oAuthUseCase,
            });
            if (r.isErr()) {
              return apiError(req, res, {
                status_code: 500,
                api_error: {
                  type: "internal_server_error",
                  message: r.error.message,
                },
              });
            }
          }

          return res.status(200).json({
            success: true,
            server: server.toJSON(),
          });
        }
        default:
          assertNever(serverType);
      }
      break;
    }

    case "DELETE": {
      const { serverType } = getServerTypeAndIdFromSId(serverId);

      const server =
        serverType == "remote"
          ? await RemoteMCPServerResource.fetchById(auth, serverId)
          : await InternalMCPServerInMemoryResource.fetchById(auth, serverId);

      if (!server) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "Remote MCP Server not found",
          },
        });
      }

      await server.delete(auth);

      return res.status(200).json({
        deleted: true,
      });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, PATCH, DELETE are expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);

async function updateOAuthUseCaseForMCPServer(
  auth: Authenticator,
  {
    mcpServerId,
    oAuthUseCase,
  }: {
    mcpServerId: string;
    oAuthUseCase: MCPOAuthUseCase;
  }
): Promise<Result<void, Error>> {
  const views = await MCPServerViewResource.listByMCPServer(auth, mcpServerId);

  for (const view of views) {
    const result = await view.updateOAuthUseCase(auth, oAuthUseCase);
    if (result.isErr()) {
      return result;
    }
  }

  return new Ok(undefined);
}
