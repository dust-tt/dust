import type { NextApiRequest, NextApiResponse } from "next";
import { MCPApiResponse } from "@app/types/mcp";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

/**
 * Synchronizes with an MCP server and retrieves its metadata and tools.
 * This function connects to the server and fetches the necessary information.
 */
async function fetchServerMetadata(url: string) {
  const mcpClient = new Client({
    name: "dust-mcp-client",
    version: "1.0.0",
  });

  try {
    const sseTransport = new SSEClientTransport(new URL(url));
    await mcpClient.connect(sseTransport);

    const serverVersion = await mcpClient.getServerVersion();
    const serverName = serverVersion?.name || "A Remote MCP Server";
    const serverDescription = 
      (serverVersion && "description" in serverVersion && typeof serverVersion.description === "string") 
        ? serverVersion.description 
        : "Remote MCP server description";
    
    // Get available tools from the server
    const toolsResult = await mcpClient.listTools();
    const serverTools = toolsResult.tools.map(tool => ({
      name: tool.name,
      description: tool.description || ""
    }));
    
    return {
      name: serverName,
      description: serverDescription,
      tools: serverTools
    };
  } finally {
    // Ensure client is closed even if there was an error
    await mcpClient.close();
  }
}

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

  // Find the specific remote MCP server for all methods
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

  switch (method) {
    case "GET": {
      try {
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

    case "POST": {
      // Special route for synchronizing this specific server
      if (req.query.action === "sync") {
        try {
          // Synchronize the server by fetching new metadata
          const metadata = await fetchServerMetadata(server.url);
          
          // Update the server settings with the new metadata
          await server.updateSettings(auth, {
            name: metadata.name,
            description: metadata.description,
          });
          
          // Update tools with the new metadata
          await server.updateTools(auth, {
            cachedTools: metadata.tools,
            lastSyncAt: new Date(),
          });
          
          return res.status(200).json({
            success: true,
            data: {
              id: server.sId,
              workspaceId: wId,
              name: server.name,
              description: server.description || "",
              tools: server.cachedTools,
              url: server.url,
              sharedSecret: server.sharedSecret,
            },
          });
        } catch (error) {
          console.error("Error synchronizing MCP server:", error);
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to synchronize MCP server",
            },
          });
        }
      } else {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid action",
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
          message: "The method passed is not supported, GET, POST, PATCH, or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler); 