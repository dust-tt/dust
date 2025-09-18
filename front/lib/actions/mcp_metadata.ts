import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SSEClientTransportOptions } from "@modelcontextprotocol/sdk/client/sse.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { StreamableHTTPClientTransportOptions } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Implementation, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { ProxyAgent } from "undici";

import {
  DEFAULT_MCP_ACTION_DESCRIPTION,
  DEFAULT_MCP_ACTION_NAME,
  DEFAULT_MCP_ACTION_VERSION,
} from "@app/lib/actions/constants";
import {
  getConnectionForMCPServer,
  MCPServerPersonalAuthenticationRequiredError,
} from "@app/lib/actions/mcp_authentication";
import { MCPServerNotFoundError } from "@app/lib/actions/mcp_errors";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import {
  DEFAULT_MCP_SERVER_ICON,
  isInternalAllowedIcon,
} from "@app/lib/actions/mcp_icons";
import { connectToInternalMCPServer } from "@app/lib/actions/mcp_internal_actions";
import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import { MCPOAuthRequiredError } from "@app/lib/actions/mcp_oauth_error";
import { MCPOAuthProvider } from "@app/lib/actions/mcp_oauth_provider";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { ClientSideRedisMCPTransport } from "@app/lib/api/actions/mcp_client_side";
import config from "@app/lib/api/config";
import type {
  InternalMCPServerDefinitionType,
  MCPServerDefinitionType,
  MCPServerType,
  MCPToolType,
} from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { isWorkspaceUsingStaticIP } from "@app/lib/misc";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { validateJsonSchema } from "@app/lib/utils/json_schemas";
import logger from "@app/logger/logger";
import type { MCPOAuthUseCase, OAuthProvider, Result } from "@app/types";
import {
  assertNever,
  EnvironmentConfig,
  Err,
  isOAuthProvider,
  normalizeError,
  Ok,
} from "@app/types";

export type AuthorizationInfo = {
  provider: OAuthProvider;
  supported_use_cases: MCPOAuthUseCase[];
  scope?: string;
};

export function isAuthorizationInfo(a: unknown): a is AuthorizationInfo {
  return (
    typeof a === "object" &&
    a !== null &&
    "provider" in a &&
    isOAuthProvider(a.provider) &&
    "supported_use_cases" in a
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
  oAuthUseCase: MCPOAuthUseCase | null;
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

function createMCPDispatcher(auth: Authenticator): ProxyAgent | undefined {
  // Default to the generic proxy.
  let proxyHost = config.getUntrustedEgressProxyHost();
  let proxyPort = config.getUntrustedEgressProxyPort();

  if (isWorkspaceUsingStaticIP(auth.getNonNullableWorkspace())) {
    proxyHost = `${EnvironmentConfig.getEnvVariable(
      "PROXY_USER_NAME"
    )}:${EnvironmentConfig.getEnvVariable(
      "PROXY_USER_PASSWORD"
    )}@${EnvironmentConfig.getEnvVariable("PROXY_HOST")}`;
    proxyPort = EnvironmentConfig.getEnvVariable("PROXY_PORT");
  }

  if (proxyHost && proxyPort) {
    const proxyUrl = `http://${proxyHost}:${proxyPort}`;
    return new ProxyAgent(proxyUrl);
  }

  return undefined;
}

export const connectToMCPServer = async (
  auth: Authenticator,
  {
    params,
    agentLoopContext,
  }: {
    params: MCPConnectionParams;
    agentLoopContext?: AgentLoopContextType;
  }
): Promise<
  Result<Client, Error | MCPServerPersonalAuthenticationRequiredError>
> => {
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
          const [client, server] = InMemoryWithAuthTransport.createLinkedPair();
          await connectToInternalMCPServer(
            params.mcpServerId,
            server,
            auth,
            agentLoopContext
          );

          await mcpClient.connect(client);

          // For internal servers, to avoid any unnecessary work, we only try to fetch the token if we are trying to run a tool.
          if (agentLoopContext?.runContext) {
            const metadata = await extractMetadataFromServerVersion(
              mcpClient.getServerVersion()
            );

            // The server requires authentication.
            if (metadata.authorization) {
              if (!params.oAuthUseCase) {
                throw new Error(
                  "Internal server requires authentication but no use case was provided - Should never happen"
                );
              }

              const c = await getConnectionForMCPServer(auth, {
                mcpServerId: params.mcpServerId,
                connectionType:
                  params.oAuthUseCase === "personal_actions"
                    ? "personal"
                    : "workspace",
              });
              if (c) {
                const authInfo: AuthInfo = {
                  token: c.access_token,
                  expiresAt: c.access_token_expiry ?? undefined,
                  clientId: "",
                  scopes: [],
                  extra: {
                    ...c.connection.metadata,
                    connectionType:
                      params.oAuthUseCase === "personal_actions"
                        ? "personal"
                        : "workspace",
                  },
                };

                client.setAuthInfo(authInfo);
                server.setAuthInfo(authInfo);
              } else {
                // For now, keeping iso.
                logger.warn(
                  {
                    workspaceId: auth.getNonNullableWorkspace().sId,
                    mcpServerId: params.mcpServerId,
                    oAuthUseCase: params.oAuthUseCase,
                  },
                  "Internal server requires workspace authentication but no connection found"
                );
                if (params.oAuthUseCase === "personal_actions") {
                  return new Err(
                    new MCPServerPersonalAuthenticationRequiredError(
                      params.mcpServerId,
                      metadata.authorization.provider,
                      metadata.authorization.scope
                    )
                  );
                } else {
                  // TODO(mcp): We return an result to display a message to the user saying that the server requires the admin to setup the connection.
                }
              }
            }
          }
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

          let token: OAuthTokens | undefined;

          // If the server has a shared secret, we use it to authenticate.
          if (remoteMCPServer.sharedSecret) {
            token = {
              access_token: remoteMCPServer.sharedSecret,
              token_type: "bearer",
              expires_in: undefined,
              scope: "",
            };
          }
          // The server requires authentication.
          else if (remoteMCPServer.authorization) {
            // We only fetch the personal token if we are running a tool.
            // Otherwise, for listing tools etc.., we use the workspace token.
            const connectionType =
              params.oAuthUseCase === "personal_actions" &&
              agentLoopContext?.runContext
                ? "personal"
                : "workspace";

            const c = await getConnectionForMCPServer(auth, {
              mcpServerId: params.mcpServerId,
              connectionType: connectionType,
            });
            if (c) {
              token = {
                access_token: c.access_token,
                token_type: "bearer",
                expires_in: c.access_token_expiry ?? undefined,
                scope: c.connection.metadata.scope,
              };
            } else {
              if (
                params.oAuthUseCase === "personal_actions" &&
                connectionType === "personal"
              ) {
                return new Err(
                  new MCPServerPersonalAuthenticationRequiredError(
                    params.mcpServerId,
                    remoteMCPServer.authorization.provider
                  )
                );
              } else {
                // TODO(mcp): We return an result to display a message to the user saying that the server requires the admin to setup the connection.
                // For now, keeping iso.
              }
            }
          }

          try {
            const req = {
              requestInit: {
                headers: undefined,
                dispatcher: createMCPDispatcher(auth),
              },
              authProvider: new MCPOAuthProvider(auth, token),
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
          dispatcher: createMCPDispatcher(auth),
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
        return new Err(normalizeError(e));
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
        : null,
    };
  }

  return {
    name: DEFAULT_MCP_ACTION_NAME,
    version: DEFAULT_MCP_ACTION_VERSION,
    description: DEFAULT_MCP_ACTION_DESCRIPTION,
    icon: DEFAULT_MCP_SERVER_ICON,
    authorization: null,
    documentationUrl: null,
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
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
      oAuthUseCase: "platform_actions",
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
      allowMultipleInstances: true,
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
