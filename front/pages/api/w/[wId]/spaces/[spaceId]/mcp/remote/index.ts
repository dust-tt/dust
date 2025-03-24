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
    await mcpClient.close();
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

  if (auth.workspace()?.sId !== wId) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message: "You don't have access to this workspace.",
      },
    });
  }

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
      try {
        const servers = await RemoteMCPServerResource.listBySpace(auth, space);

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

    case "POST": {
      try {
        const { url } = req.body;

        if (!url) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "URL is required",
            },
          });
        }

        const existingServers = await RemoteMCPServerResource.listBySpace(
          auth,
          space
        );
        const existingServer = existingServers.find(
          (server) => server.url === url
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

        const metadata = await fetchServerMetadata(url);
        const sharedSecret = generateSecureToken();

        const newRemoteMCPServer = await RemoteMCPServerResource.makeNew(
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

        return res.status(201).json({
          success: true,
          data: {
            id: newRemoteMCPServer.sId,
            workspaceId: wId,
            name: newRemoteMCPServer.name,
            description: newRemoteMCPServer.description ?? "",
            tools: newRemoteMCPServer.cachedTools,
            url: newRemoteMCPServer.url,
            sharedSecret: newRemoteMCPServer.sharedSecret,
          },
        });
      } catch (error) {
        console.error("Error creating MCP server:", error);
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
