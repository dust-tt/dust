import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Implementation, Tool } from "@modelcontextprotocol/sdk/types.js";
import { Ajv } from "ajv";
import type { JSONSchema7 as JSONSchema } from "json-schema";

import {
  DEFAULT_MCP_ACTION_DESCRIPTION,
  DEFAULT_MCP_ACTION_NAME,
  DEFAULT_MCP_ACTION_VERSION,
} from "@app/lib/actions/constants";
import { MCPServerNotFoundError } from "@app/lib/actions/mcp_errors";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import {
  DEFAULT_MCP_SERVER_ICON,
  isInternalAllowedIcon,
  isRemoteAllowedIconType,
} from "@app/lib/actions/mcp_icons";
import { connectToInternalMCPServer } from "@app/lib/actions/mcp_internal_actions";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { ClientSideRedisMCPTransport } from "@app/lib/api/actions/mcp_local";
import apiConfig from "@app/lib/api/config";
import type {
  MCPServerDefinitionType,
  MCPServerType,
  MCPToolType,
} from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import logger from "@app/logger/logger";
import type { OAuthProvider, OAuthUseCase, Result } from "@app/types";
import {
  assertNever,
  Err,
  getOAuthConnectionAccessToken,
  Ok,
} from "@app/types";

export type AuthorizationInfo = {
  provider: OAuthProvider;
  use_case: OAuthUseCase;
};

async function getAccessTokenForRemoteMCPServer(
  auth: Authenticator,
  remoteMCPServer: RemoteMCPServerResource
) {
  const metadata = remoteMCPServer.toJSON();

  if (metadata.authorization) {
    const connection = await MCPServerConnectionResource.findByMCPServer({
      auth,
      mcpServerId: metadata.id,
    });
    if (connection.isOk()) {
      const token = await getOAuthConnectionAccessToken({
        config: apiConfig.getOAuthAPIConfig(),
        logger,
        connectionId: connection.value.connectionId,
      });
      return token.isOk() ? token.value.access_token : null;
    }
  }
}

interface ConnectViaMCPServerId {
  type: "mcpServerId";
  mcpServerId: string;
}

export const isConnectViaMCPServerId = (
  params: MCPConnectionParams
): params is ConnectViaMCPServerId => {
  return params.type === "mcpServerId";
};

interface ConnectViaRemoteMCPServerUrl {
  type: "remoteMCPServerUrl";
  remoteMCPServerUrl: string;
}

interface ConnectViaLocalMCPServer {
  type: "localMCPServerId";
  conversationId: string;
  messageId: string;
  mcpServerId: string;
}

export const isConnectViaLocalMCPServer = (
  params: MCPConnectionParams
): params is ConnectViaLocalMCPServer => {
  return params.type === "localMCPServerId";
};

export type PlatformMCPConnectionParams =
  | ConnectViaMCPServerId
  | ConnectViaRemoteMCPServerUrl;

export type LocalMCPConnectionParams = ConnectViaLocalMCPServer;

export type MCPConnectionParams =
  | PlatformMCPConnectionParams
  | LocalMCPConnectionParams;

export const connectToMCPServer = async (
  auth: Authenticator,
  params: MCPConnectionParams,
  agentLoopContext?: AgentLoopContextType
): Promise<Result<Client, Error>> => {
  // This is where we route the MCP client to the right server.
  const mcpClient = new Client({
    name: "dust-mcp-client",
    version: "1.0.0",
  });
  const connectionType = params.type;
  switch (connectionType) {
    case "mcpServerId": {
      const { serverType, id } = getServerTypeAndIdFromSId(params.mcpServerId);

      switch (serverType) {
        case "internal":
          // Create a pair of linked in-memory transports
          // And connect the client to the server.
          const [client, server] = InMemoryTransport.createLinkedPair();
          await connectToInternalMCPServer(
            params.mcpServerId,
            server,
            auth,
            agentLoopContext
          );
          await mcpClient.connect(client);
          break;

        case "remote":
          const remoteMCPServer = await RemoteMCPServerResource.fetchById(
            auth,
            params.mcpServerId
          );

          if (!remoteMCPServer) {
            throw new MCPServerNotFoundError(
              `Remote MCP server with remoteMCPServerId ${id} not found for remote server type.`
            );
          }

          const accessToken = await getAccessTokenForRemoteMCPServer(
            auth,
            remoteMCPServer
          );

          const url = new URL(remoteMCPServer.url);

          try {
            const req = {
              requestInit: {
                headers: {
                  ...(accessToken
                    ? { Authorization: `Bearer ${accessToken}` }
                    : {}),
                  ...(remoteMCPServer.sharedSecret
                    ? { "X-Dust-Secret": remoteMCPServer.sharedSecret }
                    : {}),
                },
              },
            };

            const sseTransport = new SSEClientTransport(url, req);
            await mcpClient.connect(sseTransport);
          } catch (e: unknown) {
            return new Err(
              new Error("Error establishing connection to remote MCP server.")
            );
          }
          break;

        default:
          assertNever(serverType);
      }
      break;
    }
    case "remoteMCPServerUrl": {
      const url = new URL(params.remoteMCPServerUrl);

      try {
        const sseTransport = new SSEClientTransport(url);
        await mcpClient.connect(sseTransport);
      } catch (e: unknown) {
        return new Err(
          new Error("Error establishing connection to remote MCP server.")
        );
      }
      break;
    }

    case "localMCPServerId": {
      const transport = new ClientSideRedisMCPTransport(auth, {
        conversationId: params.conversationId,
        mcpServerId: params.mcpServerId,
        messageId: params.messageId,
      });
      try {
        await mcpClient.connect(transport);
      } catch (e: unknown) {
        return new Err(
          new Error("Error establishing connection to local MCP server.")
        );
      }
      break;
    }

    default: {
      assertNever(connectionType);
    }
  }

  return new Ok(mcpClient);
};

export function extractMetadataFromServerVersion(
  r: Implementation | undefined
): MCPServerDefinitionType {
  if (r) {
    return {
      name: r.name ?? DEFAULT_MCP_ACTION_NAME,
      version: r.version ?? DEFAULT_MCP_ACTION_VERSION,
      authorization:
        "authorization" in r && typeof r.authorization === "object"
          ? (r.authorization as AuthorizationInfo)
          : null,
      description:
        "description" in r && typeof r.description === "string" && r.description
          ? r.description
          : DEFAULT_MCP_ACTION_DESCRIPTION,
      icon:
        "icon" in r &&
        typeof r.icon === "string" &&
        (isRemoteAllowedIconType(r.icon) || isInternalAllowedIcon(r.icon))
          ? r.icon
          : DEFAULT_MCP_SERVER_ICON,
    };
  }

  return {
    name: DEFAULT_MCP_ACTION_NAME,
    version: DEFAULT_MCP_ACTION_VERSION,
    description: DEFAULT_MCP_ACTION_DESCRIPTION,
    icon: DEFAULT_MCP_SERVER_ICON,
    authorization: null,
  };
}

export function extractMetadataFromTools(tools: Tool[]): MCPToolType[] {
  return tools.map((tool) => {
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
): Promise<Result<Omit<MCPServerType, "id">, Error>> {
  const r = await connectToMCPServer(auth, {
    type: "remoteMCPServerUrl",
    remoteMCPServerUrl: url,
  });

  if (r.isErr()) {
    return new Err(r.error);
  }

  const mcpClient = r.value;

  try {
    const serverVersion = mcpClient.getServerVersion();
    const metadata = extractMetadataFromServerVersion(serverVersion);

    const toolsResult = await mcpClient.listTools();
    const serverTools = extractMetadataFromTools(toolsResult.tools);

    return new Ok({
      ...metadata,
      tools: serverTools,
      isDefault: false,
    });
  } catch (e: unknown) {
    return new Err(
      new Error("Error getting metadata from the remote MCP server.")
    );
  } finally {
    await mcpClient.close();
  }
}
