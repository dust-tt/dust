import type { NextApiRequest, NextApiResponse } from "next";

import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { assertNever } from "@app/types";

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

          return res.status(200).json({ server: await server.toJSON(auth) });
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
      // Note, we can only patch remote MCP servers
      const server = await RemoteMCPServerResource.fetchById(auth, serverId);

      if (!server) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "Remote MCP Server not found",
          },
        });
      }

      const { name, url, description, tools } = req.body;

      if (!name && !url && !description && !tools) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "At least one field to update is required",
          },
        });
      }

      await server.updateMetadata(auth, {
        name,
        url,
        description,
        cachedTools: tools,
        lastSyncAt: new Date(),
      });

      return res.status(200).json({
        success: true,
        server: server.toJSON(),
      });
    }

    case "DELETE": {
      const { serverType } = getServerTypeAndIdFromSId(serverId);

      if (serverType == "internal") {
        // TODO(mcp) delete the internal MCP server
      } else {
        const server = await RemoteMCPServerResource.fetchById(auth, serverId);

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
      }

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
