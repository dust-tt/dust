import type { NextApiRequest, NextApiResponse } from "next";
import { RemoteMCPServer } from "@app/lib/models/assistant/actions/remote_mcp_server";
import { MCPApiResponse } from "@app/types/mcp";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { randomBytes } from "crypto";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { GetRemoteMCPServersResponseBody } from "@app/lib/swr/remote_mcp_servers";

// Function to generate a secure token
function generateSecureToken(): string {
  return randomBytes(32).toString("hex");
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<MCPApiResponse | GetRemoteMCPServersResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { method } = req;
  const { wId, spaceId } = req.query;

  if (typeof wId !== "string" || typeof spaceId !== "string") {
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
          "Only users that are `builders` for the current workspace can manage MCP servers.",
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

  // Get the actual workspace and space database IDs
  const workspace = auth.workspace();
  const space = await SpaceResource.fetchById(auth, spaceId);

  if (!workspace || !space) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "Workspace or space not found",
      },
    });
  }

  // Use the numeric IDs for database operations
  const workspaceIdNum = workspace.id;
  const spaceIdNum = space.id;

  switch (method) {
    case "GET": {
      // Check if we're listing servers or synchronizing with a specific URL
      const { url } = req.query;

      if (url) {
        // Synchronize with a remote MCP server
        try {
          if (typeof url !== "string" || !url) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "URL parameter is required",
              },
            });
          }

          // Generate secure tokens
          const sharedSecret = generateSecureToken();
          const sId = generateSecureToken();

          // In a real implementation, we would fetch the tools from the MCP server
          // For now, use mock data
          const mockTools = [
            "Search Web",
            "Generate Image" 
          ];

          // Create a new MCP server
          const newMCPServer = await RemoteMCPServer.create({
            workspaceId: workspaceIdNum,
            spaceId: spaceIdNum,
            name: "New MCP Server", // Default name
            url: url,
            description: "Fetched MCP Server", // Default description
            cachedTools: mockTools,
            lastSyncAt: new Date(),
            sharedSecret,
            sId,
          });

          return res.status(200).json({
            success: true,
            data: {
              id: newMCPServer.sId,
              workspaceId: wId,
              name: newMCPServer.name,
              description: newMCPServer.description ?? "",
              tools: newMCPServer.cachedTools,
              sharedSecret: newMCPServer.sharedSecret,
            },
          });
        } catch (error) {
          console.error("Error synchronizing MCP:", error);
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Internal server error",
            },
          });
        }
      } else {
        // List all MCP servers for this space
        try {
          // Find all remote MCP servers for this space
          const servers = await RemoteMCPServer.findAll({
            where: { workspaceId: workspaceIdNum, spaceId: spaceIdNum },
          });

          // Map the server records to the expected response format
          const serverResponses = servers.map((server) => ({
            id: server.sId,
            workspaceId: wId,
            name: server.name,
            description: server.description || "",
            tools: server.cachedTools,
            url: server.url,
            // Don't include sharedSecret in the list response
          }));

          return res.status(200).json({
            servers: serverResponses,
          });
        } catch (error) {
          console.error("Error listing remote MCP servers:", error);
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Internal server error",
            },
          });
        }
      }
    }

    case "POST": {
      try {
        const { name, url, description, tools } = req.body;

        // Validate required fields
        if (!name || !url || !description) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Missing required fields",
            },
          });
        }

        // Generate a secure shared secret
        const sharedSecret = generateSecureToken();

        // Create the remote MCP server
        const newRemoteMCPServer = await RemoteMCPServer.create({
          workspaceId: workspaceIdNum,
          spaceId: spaceIdNum,
          name,
          url,
          description,
          cachedTools: tools || [],
          lastSyncAt: new Date(),
          sharedSecret,
          sId: generateSecureToken(),
        });

        return res.status(201).json({
          success: true,
          data: {
            id: newRemoteMCPServer.sId,
            workspaceId: wId,
            name: newRemoteMCPServer.name,
            description: newRemoteMCPServer.description ?? "",
            tools: newRemoteMCPServer.cachedTools,
          },
        });
      } catch (error) {
        console.error("Error creating MCP:", error);
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
          message: "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler); 
