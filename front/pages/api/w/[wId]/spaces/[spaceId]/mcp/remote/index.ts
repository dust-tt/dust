import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { randomBytes } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { GetRemoteMCPServersResponseBody } from "@app/lib/swr/remote_mcp_servers";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { MCPApiResponse } from "@app/types/mcp";

// Function to generate a secure token
function generateSecureToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Synchronizes with an MCP server and retrieves its metadata and tools.
 * This function connects to the server and fetches the necessary information.
 * It does not create or update the database record.
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
      serverVersion &&
      "description" in serverVersion &&
      typeof serverVersion.description === "string"
        ? serverVersion.description
        : "Remote MCP server description";

    // Get available tools from the server
    const toolsResult = await mcpClient.listTools();
    const serverTools = toolsResult.tools.map((tool) => ({
      name: tool.name,
      description: tool.description || "",
    }));

    return {
      name: serverName,
      description: serverDescription,
      tools: serverTools,
    };
  } finally {
    // Ensure client is closed even if there was an error
    await mcpClient.close();
  }
}

/**
 * Synchronizes with an MCP server by creating a new one or updating an existing one.
 * Returns the synchronized server resource.
 */
async function synchronizeServer(
  auth: Authenticator,
  workspace: any,
  space: any,
  url: string,
  existingServer?: any
) {
  // Fetch metadata from the remote server
  const metadata = await fetchServerMetadata(url);

  if (existingServer) {
    // Update existing server
    await existingServer.updateSettings(auth, {
      name: metadata.name,
      url: url,
      description: metadata.description,
    });

    await existingServer.updateTools(auth, {
      cachedTools: metadata.tools,
      lastSyncAt: new Date(),
    });

    return existingServer;
  } else {
    // Create a new MCP server
    const sharedSecret = generateSecureToken();
    return RemoteMCPServerResource.makeNew(
      {
        workspaceId: workspace.id,
        name: metadata.name,
        url: url,
        description: metadata.description,
        cachedTools: metadata.tools,
        lastSyncAt: new Date(),
        sharedSecret,
      },
      space
    );
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<MCPApiResponse | GetRemoteMCPServersResponseBody>
  >,
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

          // Check if a server with this URL already exists
          // If a server with the same URL exists, we'll update it instead of creating a new one
          // This ensures that synchronizing an existing server doesn't create duplicates
          const existingServers = await RemoteMCPServerResource.listBySpace(
            auth,
            space
          );
          const existingServer = existingServers.find(
            (server) => server.url === url
          );

          // Synchronize the server (either create new or update existing)
          const mcpServer = await synchronizeServer(
            auth,
            workspace,
            space,
            url,
            existingServer
          );

          return res.status(200).json({
            success: true,
            data: {
              id: mcpServer.sId,
              workspaceId: wId,
              name: mcpServer.name,
              description: mcpServer.description ?? "",
              tools: mcpServer.cachedTools,
              sharedSecret: mcpServer.sharedSecret,
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
        try {
          const servers = await RemoteMCPServerResource.listBySpace(
            auth,
            space
          );

          const serverResponses = servers.map((server) => ({
            id: server.sId,
            workspaceId: wId,
            name: server.name,
            description: server.description || "",
            tools: server.cachedTools,
            url: server.url,
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

        if (!name || !url || !description) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Missing required fields",
            },
          });
        }

        const sharedSecret = generateSecureToken();

        const newRemoteMCPServer = await RemoteMCPServerResource.makeNew(
          {
            workspaceId: workspace.id,
            name,
            url,
            description,
            cachedTools: tools || [],
            lastSyncAt: new Date(),
            sharedSecret,
          },
          space
        );

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
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
