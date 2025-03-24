import type { NextApiRequest, NextApiResponse } from "next";
import { MCPApiResponse } from "@app/types/mcp";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<MCPApiResponse>>,
  auth: Authenticator
): Promise<void> {
  const { method } = req;
  const { wId, spaceId, serverId } = req.query;

  if (typeof wId !== "string" || typeof spaceId !== "string" || typeof serverId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  // Check authentication
  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only users that are `builders` for the current workspace can view MCP servers.",
      },
    });
  }

  // Ensure workspace ID matches authenticated workspace
  if (auth.workspace()?.sId !== wId) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message: "You don't have access to this workspace.",
      },
    });
  }

  // Get the space resource
  const space = await SpaceResource.fetchById(auth, spaceId);

  if (!space) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "Space not found",
      },
    });
  }

  switch (method) {
    case "GET": {
      try {
        // Find the specific remote MCP server
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

        return res.status(200).json({
          success: true,
          data: {
            id: server.sId,
            workspaceId: wId,
            name: server.name,
            description: server.description || "",
            tools: server.cachedTools,
            url: server.url,
            // Include shared secret in individual server response
            sharedSecret: server.sharedSecret,
          },
        });
      } catch (error) {
        console.error("Error fetching remote MCP server:", error);
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Internal server error",
          },
        });
      }
    }

    case "PATCH": {
      try {
        const { name, url, description, tools } = req.body;

        // Validate required fields
        if (!name || !url) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Name and URL are required fields",
            },
          });
        }

        // Find the specific MCP server
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

        // Update the server settings
        await server.updateSettings(auth, {
          name,
          url,
          description,
        });
        
        // Update tools if provided
        if (tools) {
          await server.updateTools(auth, {
            cachedTools: tools,
            lastSyncAt: new Date(),
          });
        }

        return res.status(200).json({
          success: true,
          data: {
            id: server.sId,
            workspaceId: wId,
            name: server.name,
            description: server.description || "",
            tools: server.cachedTools,
            url: server.url,
          },
        });
      } catch (error) {
        console.error("Error updating remote MCP server:", error);
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Internal server error",
          },
        });
      }
    }

    case "DELETE": {
      try {
        // Find and delete the specific remote MCP server
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

        await server.hardDelete(auth);

        return res.status(200).json({
          success: true,
          data: {
            id: serverId,
            name: server.name,
            description: server.description || "",
            tools: server.cachedTools,
          },
        });
      } catch (error) {
        console.error("Error deleting remote MCP server:", error);
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Internal server error",
          },
        });
      }
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET, PATCH, or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler); 