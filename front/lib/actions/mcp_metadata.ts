import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
  Implementation,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { Ajv } from "ajv";
import type { JSONSchema7 as JSONSchema } from "json-schema";

import {
  DEFAULT_MCP_ACTION_DESCRIPTION,
  DEFAULT_MCP_ACTION_ICON,
  DEFAULT_MCP_ACTION_NAME,
  DEFAULT_MCP_ACTION_VERSION,
} from "@app/lib/actions/constants";
import { MCPServerNotFoundError } from "@app/lib/actions/mcp_errors";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import type { AllowedIconType } from "@app/lib/actions/mcp_icons";
import { isAllowedIconType } from "@app/lib/actions/mcp_icons";
import {
  connectToInternalMCPServer,
  getInternalMCPServerSId,
} from "@app/lib/actions/mcp_internal_actions";
import { AVAILABLE_INTERNAL_MCPSERVER_NAMES } from "@app/lib/actions/mcp_internal_actions/constants";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import logger from "@app/logger/logger";
import type { OAuthProvider, OAuthUseCase } from "@app/types";
import { assertNever } from "@app/types";
import { getOAuthConnectionAccessToken } from "@app/types";

export type MCPToolType = {
  name: string;
  description: string;
  inputSchema: JSONSchema | undefined;
};

export type MCPServerType = {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: AllowedIconType;
  authorization?: AuthorizationInfo;
  tools: MCPToolType[];
};

export type AuthorizationInfo = {
  provider: OAuthProvider;
  use_case: OAuthUseCase;
};

async function getAccessTokenForMCPServer(
  auth: Authenticator,
  mcpServerId: string
) {
  const metadata = await getMCPServerMetadataLocally(auth, {
    mcpServerId: mcpServerId,
  });

  if (metadata.authorization) {
    const connection = await MCPServerConnectionResource.findByMCPServer({
      auth,
      mcpServerId: mcpServerId,
    });
    if (connection.isOk()) {
      const token = await getOAuthConnectionAccessToken({
        config: apiConfig.getOAuthAPIConfig(),
        logger,
        provider: metadata.authorization.provider,
        connectionId: connection.value.connectionId,
      });
      return token.isOk() ? token.value.access_token : null;
    }
  }
}

export const connectToMCPServer = async (
  auth: Authenticator,
  {
    mcpServerId,
    remoteMCPServerUrl,
  }: {
    mcpServerId?: string;
    remoteMCPServerUrl?: string | null;
  }
) => {
  //TODO(mcp): handle failure, timeout...
  // This is where we route the MCP client to the right server.
  const mcpClient = new Client({
    name: "dust-mcp-client",
    version: "1.0.0",
  });
  if (mcpServerId) {
    const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);

    switch (serverType) {
      case "internal":
        // Create a pair of linked in-memory transports
        // And connect the client to the server.
        const [client, server] = InMemoryTransport.createLinkedPair();
        await connectToInternalMCPServer(mcpServerId, server, auth);
        await mcpClient.connect(client);
        break;

      case "remote":
        const accessToken = await getAccessTokenForMCPServer(auth, mcpServerId);

        const remoteMCPServer = await RemoteMCPServerResource.fetchById(
          auth,
          mcpServerId
        );

        if (!remoteMCPServer) {
          throw new MCPServerNotFoundError(
            `Remote MCP server with remoteMCPServerId ${id} not found for remote server type.`
          );
        }

        const url = new URL(remoteMCPServer.url);
        const sseTransport = new SSEClientTransport(url, {
          requestInit: {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        });
        await mcpClient.connect(sseTransport);
        break;

      default:
        assertNever(serverType);
    }
  } else if (remoteMCPServerUrl) {
    const url = new URL(remoteMCPServerUrl);
    const sseTransport = new SSEClientTransport(url);
    await mcpClient.connect(sseTransport);
  } else {
    throw new Error("MCP server ID or URL is required.");
  }

  return mcpClient;
};

function extractMetadataFromServerVersion(
  r: Implementation | undefined
): Omit<MCPServerType, "tools" | "id"> {
  if (r) {
    return {
      name: r.name ?? DEFAULT_MCP_ACTION_NAME,
      version: r.version ?? DEFAULT_MCP_ACTION_VERSION,
      authorization:
        "authorization" in r && typeof r.authorization === "object"
          ? (r.authorization as AuthorizationInfo)
          : undefined,
      description:
        "description" in r && typeof r.description === "string" && r.description
          ? r.description
          : DEFAULT_MCP_ACTION_DESCRIPTION,
      icon:
        "icon" in r && typeof r.icon === "string" && isAllowedIconType(r.icon)
          ? r.icon
          : DEFAULT_MCP_ACTION_ICON,
    };
  }

  return {
    name: DEFAULT_MCP_ACTION_NAME,
    version: DEFAULT_MCP_ACTION_VERSION,
    description: DEFAULT_MCP_ACTION_DESCRIPTION,
    icon: DEFAULT_MCP_ACTION_ICON,
  };
}

function extractMetadataFromTools(tools: ListToolsResult): MCPToolType[] {
  return tools.tools.map((tool) => {
    let inputSchema: JSONSchema | undefined;
    const ajv = new Ajv();

    if (ajv.validateSchema(tool.inputSchema)) {
      inputSchema = tool.inputSchema as JSONSchema; // unfortunately, ajv does not assert the type when returning.
    } else {
      logger.error(`[MCP] Invalid input schema for tool: ${tool.name}.`);
    }
    return {
      name: tool.name,
      description: tool.description || "",
      inputSchema,
    };
  });
}

export async function fetchRemoteServerMetaDataByURL(
  auth: Authenticator,
  url: string
): Promise<Omit<MCPServerType, "id">> {
  const mcpClient = await connectToMCPServer(auth, {
    remoteMCPServerUrl: url,
  });

  try {
    const serverVersion = mcpClient.getServerVersion();
    const metadata = extractMetadataFromServerVersion(serverVersion);

    const toolsResult = await mcpClient.listTools();
    const serverTools = extractMetadataFromTools(toolsResult);

    return {
      ...metadata,
      tools: serverTools,
    };
  } finally {
    await mcpClient.close();
  }
}

/**
 * Get the metadata of the MCP server.
 *
 * This function is safe to call even if the server is remote as it will not connect to the server and use the cached metadata.
 */
export async function getMCPServerMetadataLocally(
  auth: Authenticator,
  {
    mcpServerId,
    remoteMCPServer,
  }: {
    mcpServerId: string;
    remoteMCPServer?: RemoteMCPServerResource;
  }
): Promise<MCPServerType> {
  const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);
  switch (serverType) {
    case "internal":
      // For internal servers, we can connect to the server directly as it's an in-memory communication in the same process.
      const mcpClient = await connectToMCPServer(auth, { mcpServerId });

      const r = mcpClient.getServerVersion();
      const tools = await mcpClient.listTools();
      await mcpClient.close();

      return {
        id: mcpServerId,
        ...extractMetadataFromServerVersion(r),
        tools: extractMetadataFromTools(tools),
      };

    case "remote":
      // TODO(mcp): add a background job to update the metadata by calling updateRemoteMCPServerMetadata.

      let server: RemoteMCPServerResource | null = null;
      if (!remoteMCPServer) {
        server = await RemoteMCPServerResource.fetchById(auth, mcpServerId);
      } else {
        server = remoteMCPServer;
      }

      if (!server) {
        throw new MCPServerNotFoundError(
          `Remote MCP server with remoteMCPServerId ${id} not found for remote server type.`
        );
      }
      if (server.id !== id) {
        throw new Error(
          `Remote MCP server id do not match ${id} !== ${server.id}`
        );
      }

      return {
        id: server.sId,
        name: server.name,
        // TODO(mcp): add version on remoteMCPServer
        version: DEFAULT_MCP_ACTION_VERSION,
        description: server.description ?? DEFAULT_MCP_ACTION_DESCRIPTION,
        // TODO(mcp): add icon on remoteMCPServer
        icon: DEFAULT_MCP_ACTION_ICON,
        tools: server.cachedTools,
      };

    default:
      assertNever(serverType);
  }
}

export async function getAllMCPServersMetadataLocally(
  auth: Authenticator
): Promise<MCPServerType[]> {
  const mcpServers = await Promise.all(
    AVAILABLE_INTERNAL_MCPSERVER_NAMES.map(async (internalMCPServerName) => {
      const mcpServerId = getInternalMCPServerSId(auth, {
        internalMCPServerName,
      });
      const metadata = await getMCPServerMetadataLocally(auth, {
        mcpServerId,
      });
      return metadata;
    })
  );

  return mcpServers;
}
