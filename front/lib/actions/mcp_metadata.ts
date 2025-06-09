import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SSEClientTransportOptions } from "@modelcontextprotocol/sdk/client/sse.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { StreamableHTTPClientTransportOptions } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Implementation, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { getGlobalDispatcher } from "undici";

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
} from "@app/lib/actions/mcp_icons";
import { connectToInternalMCPServer } from "@app/lib/actions/mcp_internal_actions";
import { MCPOAuthRequiredError } from "@app/lib/actions/mcp_oauth_error";
import { MCPOAuthProvider } from "@app/lib/actions/mcp_oauth_provider";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { ClientSideRedisMCPTransport } from "@app/lib/api/actions/mcp_client_side";
import type {
  InternalMCPServerDefinitionType,
  MCPServerDefinitionType,
  MCPServerType,
  MCPToolType,
} from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { validateJsonSchema } from "@app/lib/utils/json_schemas";
import logger from "@app/logger/logger";
import type { OAuthProvider, OAuthUseCase, Result } from "@app/types";
import {
  assertNever,
  Err,
  isOAuthProvider,
  isOAuthUseCase,
  Ok,
} from "@app/types";
import { createSSRFInterceptor } from "@app/types/shared/utils/ssrf";

export type AuthorizationInfo = {
  provider: OAuthProvider;
  use_case: OAuthUseCase;
  scope?: string;
};

export function isAuthorizationInfo(a: unknown): a is AuthorizationInfo {
  return (
    typeof a === "object" &&
    a !== null &&
    "provider" in a &&
    isOAuthProvider(a.provider) &&
    "use_case" in a &&
    isOAuthUseCase(a.use_case)
  );
}

export function isInternalMCPServerDefinition(
  server: Implementation
): server is InternalMCPServerDefinitionType {
  return (
    "authorization" in server &&
    (isAuthorizationInfo(server.authorization) ||
      server.authorization === null) &&
    "description" in server &&
    typeof server.description === "string" &&
    "icon" in server &&
    typeof server.icon === "string" &&
    isInternalAllowedIcon(server.icon)
  );
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
  headers?: Record<string, string>;
}

interface ConnectViaClientSideMCPServer {
  type: "clientSideMCPServerId";
  conversationId: string;
  messageId: string;
  mcpServerId: string;
}

export const isConnectViaClientSideMCPServer = (
  params: MCPConnectionParams
): params is ConnectViaClientSideMCPServer => {
  return params.type === "clientSideMCPServerId";
};

export type ServerSideMCPConnectionParams =
  | ConnectViaMCPServerId
  | ConnectViaRemoteMCPServerUrl;

export type ClientSideMCPConnectionParams = ConnectViaClientSideMCPServer;

export type MCPConnectionParams =
  | ServerSideMCPConnectionParams
  | ClientSideMCPConnectionParams;

export const connectToMCPServer = async (
  auth: Authenticator,
  {
    params,
    agentLoopContext,
  }: {
    params: MCPConnectionParams;
    agentLoopContext?: AgentLoopContextType;
  }
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

          const url = new URL(remoteMCPServer.url);

          try {
            const req = {
              requestInit: {
                headers: undefined,
                dispatcher: getGlobalDispatcher().compose(
                  // @ts-expect-error: looks like undici typing is not up to date
                  createSSRFInterceptor()
                ),
              },
              authProvider: new MCPOAuthProvider(auth, remoteMCPServer),
            };

            await connectToRemoteMCPServer(mcpClient, url, req);
          } catch (e: unknown) {
            logger.error(
              {
                connectionType,
                serverType,
                workspaceId: auth.getNonNullableWorkspace().sId,
                error: e,
              },
              "Error establishing connection to remote MCP server via ID"
            );
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
      const req = {
        requestInit: {
          dispatcher: getGlobalDispatcher().compose(
            // @ts-expect-error: looks like undici typing is not up to date
            createSSRFInterceptor()
          ),
          headers: { ...(params.headers ?? {}) },
        },
        authProvider: new MCPOAuthProvider(auth, undefined),
      };
      try {
        await connectToRemoteMCPServer(mcpClient, url, req);
      } catch (e: unknown) {
        if (e instanceof MCPOAuthRequiredError) {
          logger.info(
            {
              error: e,
            },
            "Authorization required to connect to remote MCP server"
          );

          return new Err(e);
        }

        logger.error(
          {
            connectionType,
            workspaceId: auth.getNonNullableWorkspace().sId,
            error: e,
          },
          "Error establishing connection to remote MCP server via URL"
        );
        return new Err(
          new Error("Check URL and if a bearer token is required.")
        );
      }
      break;
    }

    case "clientSideMCPServerId": {
      const transport = new ClientSideRedisMCPTransport(auth, {
        conversationId: params.conversationId,
        mcpServerId: params.mcpServerId,
        messageId: params.messageId,
      });
      try {
        await mcpClient.connect(transport);
      } catch (e: unknown) {
        logger.error(
          {
            connectionType,
            workspaceId: auth.getNonNullableWorkspace().sId,
            error: e,
          },
          "Error establishing connection to remote MCP server"
        );
        return new Err(
          new Error("Error establishing connection to client side MCP server.")
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

// Try to connect via streamableHttpTransport first, and if that fails, fall back to sseTransport.
async function connectToRemoteMCPServer(
  mcpClient: Client,
  url: URL,
  req: SSEClientTransportOptions | StreamableHTTPClientTransportOptions
) {
  try {
    const streamableHttpTransport = new StreamableHTTPClientTransport(url, req);
    await mcpClient.connect(streamableHttpTransport);
  } catch (error) {
    // Check if error message contains "HTTP 4xx" as suggested by the official doc.
    // Doc is here https://github.com/modelcontextprotocol/typescript-sdk?tab=readme-ov-file#client-side-compatibility.
    if (error instanceof Error && /HTTP 4\d\d/.test(error.message)) {
      logger.info(
        {
          url: url.toString(),
          error: error.message,
        },
        "Error establishing connection to remote MCP server via streamableHttpTransport, falling back to sseTransport."
      );
      const sseTransport = new SSEClientTransport(url, req);
      await mcpClient.connect(sseTransport);
    } else {
      throw error;
    }
  }
}

export function extractMetadataFromServerVersion(
  r: Implementation | undefined
): MCPServerDefinitionType {
  if (r) {
    return {
      name: r.name ?? DEFAULT_MCP_ACTION_NAME,
      version: r.version ?? DEFAULT_MCP_ACTION_VERSION,
      authorization: isInternalMCPServerDefinition(r) ? r.authorization : null,
      description: isInternalMCPServerDefinition(r)
        ? r.description
        : DEFAULT_MCP_ACTION_DESCRIPTION,
      icon: isInternalMCPServerDefinition(r) ? r.icon : DEFAULT_MCP_SERVER_ICON,
      documentationUrl: isInternalMCPServerDefinition(r)
        ? r.documentationUrl
        : undefined,
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

    const { isValid, error } = validateJsonSchema(tool.inputSchema);
    if (isValid) {
      inputSchema = tool.inputSchema as JSONSchema;
    } else {
      logger.error(
        `[MCP] Invalid input schema for tool: ${tool.name} (${error}).`
      );
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
  url: string,
  headers?: Record<string, string>
): ReturnType<typeof fetchRemoteServerMetaData> {
  const r = await connectToMCPServer(auth, {
    params: {
      type: "remoteMCPServerUrl",
      remoteMCPServerUrl: url,
      headers,
    },
  });

  if (r.isErr()) {
    return r;
  }

  const result = await fetchRemoteServerMetaData(auth, r.value);
  await r.value.close();
  return result;
}

export async function fetchRemoteServerMetaDataByServerId(
  auth: Authenticator,
  serverId: string
): ReturnType<typeof fetchRemoteServerMetaData> {
  const r = await connectToMCPServer(auth, {
    params: {
      type: "mcpServerId",
      mcpServerId: serverId,
    },
  });

  if (r.isErr()) {
    return r;
  }

  const result = await fetchRemoteServerMetaData(auth, r.value);
  await r.value.close();
  return result;
}

async function fetchRemoteServerMetaData(
  auth: Authenticator,
  mcpClient: Client
): Promise<Result<Omit<MCPServerType, "sId">, Error>> {
  try {
    const serverVersion = mcpClient.getServerVersion();
    const metadata = extractMetadataFromServerVersion(serverVersion);

    const toolsResult = await mcpClient.listTools();
    const serverTools = extractMetadataFromTools(toolsResult.tools);

    return new Ok({
      ...metadata,
      tools: serverTools,
      availability: "manual",
    });
  } catch (e: unknown) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        error: e,
      },
      "Error fetching metadata from remote MCP server"
    );
    return new Err(
      new Error("Error getting metadata from the remote MCP server.")
    );
  }
}
