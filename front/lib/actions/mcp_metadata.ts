import {
  DEFAULT_MCP_ACTION_DESCRIPTION,
  DEFAULT_MCP_ACTION_NAME,
  DEFAULT_MCP_ACTION_VERSION,
} from "@app/lib/actions/constants";
import {
  getConnectionForMCPServer,
  MCPServerPersonalAuthenticationRequiredError,
  MCPServerRequiresAdminAuthenticationError,
} from "@app/lib/actions/mcp_authentication";
import { MCPServerNotFoundError } from "@app/lib/actions/mcp_errors";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { DEFAULT_MCP_SERVER_ICON } from "@app/lib/actions/mcp_icons";
import { connectToInternalMCPServer } from "@app/lib/actions/mcp_internal_actions";
import {
  getInternalMCPServerInfo,
  getInternalMCPServerNameFromSId,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import {
  MCPOAuthProvider,
  MCPOAuthProviderError,
} from "@app/lib/actions/mcp_oauth_provider";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { ClientSideRedisMCPTransport } from "@app/lib/api/actions/mcp_client_side";
import type { MCPServerType, MCPToolType } from "@app/lib/api/mcp";
import { invalidateOAuthConnectionAccessTokenCache } from "@app/lib/api/oauth_access_token";
import { isHostUnderVerifiedDomain } from "@app/lib/api/workspace_has_domains";
import type { Authenticator } from "@app/lib/auth";
import {
  createProxyFetch,
  getStaticIPProxyAgent,
  getUntrustedEgressAgent,
} from "@app/lib/egress/server";
import { isWorkspaceUsingStaticIP } from "@app/lib/misc";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import logger from "@app/logger/logger";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SSEClientTransportOptions } from "@modelcontextprotocol/sdk/client/sse.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { StreamableHTTPClientTransportOptions } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { JSONSchema7 as JSONSchema } from "json-schema";

const DEFAULT_MCP_CLIENT_CONNECT_TIMEOUT_MS = 25_000;

// Short timeout: the Redis round-trip is near-instant when the browser
// is connected. If it takes longer than 5s the browser is likely
// disconnected and waiting further won't help.
const CLIENT_SIDE_CONNECT_TIMEOUT_MS = 5_000;

type MCPProxyKind = "static_ip_proxy" | "untrusted_egress_proxy" | "direct";
type MCPProxyConfig = {
  dispatcher?: ReturnType<typeof getUntrustedEgressAgent>;
  fetch?: FetchLike;
  proxyKind: MCPProxyKind;
};

interface ConnectViaMCPServerId {
  type: "mcpServerId";
  mcpServerId: string;
  oAuthUseCase: MCPOAuthUseCase | null;
}

export function isConnectViaMCPServerId(
  params: MCPConnectionParams
): params is ConnectViaMCPServerId {
  return params.type === "mcpServerId";
}

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

export function isConnectViaClientSideMCPServer(
  params: MCPConnectionParams
): params is ConnectViaClientSideMCPServer {
  return params.type === "clientSideMCPServerId";
}

export type ServerSideMCPConnectionParams =
  | ConnectViaMCPServerId
  | ConnectViaRemoteMCPServerUrl;

export type ClientSideMCPConnectionParams = ConnectViaClientSideMCPServer;

export type MCPConnectionParams =
  | ServerSideMCPConnectionParams
  | ClientSideMCPConnectionParams;

/**
 * Build the proxy configuration for a remote MCP server connection.
 *
 * Returns both a `dispatcher` (for POST requests via `send()`) and a custom
 * `fetch` function. The custom `fetch` is necessary because the MCP SDK's
 * SSEClientTransport and StreamableHTTPClientTransport do NOT forward
 * `requestInit.dispatcher` to their internal EventSource/GET fetch calls.
 * Without a custom `fetch`, those connections fall through to the global fetch
 * which may use a different proxy (e.g. squid-proxy instead of http-proxy).
 */
async function createMCPProxyConfig(
  auth: Authenticator,
  host: string
): Promise<MCPProxyConfig> {
  const workspace = auth.getNonNullableWorkspace();

  // Check if workspace should use static IP:
  // 1. Legacy hardcoded check for specific workspaces
  // 2. Domain-based check: host is under any verified domain for this workspace
  const useStaticIP =
    isWorkspaceUsingStaticIP(workspace) ||
    (await isHostUnderVerifiedDomain(auth, host));

  if (useStaticIP) {
    const staticAgent = getStaticIPProxyAgent();
    if (staticAgent) {
      logger.info(
        { workspaceId: workspace.sId, host },
        "Using static IP proxy for MCP request"
      );
      return {
        dispatcher: staticAgent,
        fetch: createProxyFetch(staticAgent),
        proxyKind: "static_ip_proxy" as const,
      };
    }
    logger.warn(
      { workspaceId: workspace.sId, host },
      "Static IP proxy required but not configured, falling back to untrusted egress"
    );
  }

  const dispatcher = getUntrustedEgressAgent();
  if (!dispatcher) {
    return { proxyKind: "direct" as const };
  }

  return {
    dispatcher,
    fetch: createProxyFetch(dispatcher),
    proxyKind: "untrusted_egress_proxy" as const,
  };
}

/**
 * Resolve the OAuth token for a remote MCP server.
 *
 * For personal_actions servers:
 *   - Tool execution: use the user's personal token.
 *   - Listing tools (user session): try personal token first, fall back to workspace.
 *   - Listing tools (sync / no user): use workspace token.
 * For platform_actions or servers without auth: use workspace token or shared secret.
 */
async function resolveRemoteServerOAuthToken(
  auth: Authenticator,
  {
    mcpServerId,
    oAuthUseCase,
    remoteMCPServer,
    isToolExecution,
  }: {
    mcpServerId: string;
    oAuthUseCase: MCPOAuthUseCase | null;
    remoteMCPServer: RemoteMCPServerResource;
    isToolExecution: boolean;
  }
): Promise<
  Result<
    {
      token: OAuthTokens | undefined;
      oauthConnectionType: "personal" | "workspace" | undefined;
      oauthConnectionId: string | undefined;
    },
    Error | MCPServerPersonalAuthenticationRequiredError
  >
> {
  // Shared secret: no OAuth needed.
  if (remoteMCPServer.sharedSecret) {
    return new Ok({
      token: {
        access_token: remoteMCPServer.sharedSecret,
        token_type: "bearer",
        expires_in: undefined,
        scope: "",
      },
      oauthConnectionType: undefined,
      oauthConnectionId: undefined,
    });
  }

  // No authorization required.
  if (!remoteMCPServer.authorization) {
    return new Ok({
      token: undefined,
      oauthConnectionType: undefined,
      oauthConnectionId: undefined,
    });
  }

  // Determine which connection type to try.
  let connectionType: "personal" | "workspace";
  if (oAuthUseCase === "personal_actions" && isToolExecution) {
    connectionType = "personal";
  } else if (oAuthUseCase === "personal_actions" && auth.user()) {
    // Listing tools with a user session: try personal first.
    const personalConnection = await getConnectionForMCPServer(auth, {
      mcpServerId,
      connectionType: "personal",
    });
    if (personalConnection.isOk()) {
      return new Ok({
        token: {
          access_token: personalConnection.value.access_token,
          token_type: "bearer",
          expires_in: personalConnection.value.access_token_expiry ?? undefined,
          scope: personalConnection.value.connection.metadata.scope,
        },
        oauthConnectionType: "personal",
        oauthConnectionId: personalConnection.value.connection.connection_id,
      });
    }
    // Personal connection not found — fall back to workspace.
    connectionType = "workspace";
  } else {
    connectionType = "workspace";
  }

  // Fetch connection token.
  const c = await getConnectionForMCPServer(auth, {
    mcpServerId,
    connectionType,
  });
  if (c.isOk()) {
    return new Ok({
      token: {
        access_token: c.value.access_token,
        token_type: "bearer",
        expires_in: c.value.access_token_expiry ?? undefined,
        scope: c.value.connection.metadata.scope,
      },
      oauthConnectionType: connectionType,
      oauthConnectionId: c.value.connection.connection_id,
    });
  }

  // Connection failed — return the appropriate error.
  const { provider, scope } = remoteMCPServer.authorization;

  switch (connectionType) {
    case "personal": {
      // Check if admin has set up the workspace connection.
      const adminConnectionRes =
        await MCPServerConnectionResource.findByMCPServer(auth, {
          mcpServerId,
          connectionType: "workspace",
        });
      if (
        adminConnectionRes.isErr() &&
        adminConnectionRes.error.code === "connection_not_found"
      ) {
        return new Err(
          new MCPServerRequiresAdminAuthenticationError(
            mcpServerId,
            provider,
            scope
          )
        );
      }
      return new Err(
        new MCPServerPersonalAuthenticationRequiredError(
          mcpServerId,
          provider,
          scope
        )
      );
    }
    case "workspace":
      return new Err(
        new MCPServerRequiresAdminAuthenticationError(
          mcpServerId,
          provider,
          scope
        )
      );
    default:
      assertNever(connectionType);
  }
}

export async function connectToMCPServer(
  auth: Authenticator,
  {
    params,
    agentLoopContext,
    allowDirectToolExecution,
  }: {
    params: MCPConnectionParams;
    agentLoopContext?: AgentLoopContextType;
    allowDirectToolExecution?: boolean;
  }
): Promise<
  Result<Client, Error | MCPServerPersonalAuthenticationRequiredError>
> {
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
          if (agentLoopContext?.runContext || allowDirectToolExecution) {
            const bearerTokenCredentials =
              await InternalMCPServerInMemoryResource.fetchDecryptedCredentials(
                auth,
                params.mcpServerId
              );

            const serverName = getInternalMCPServerNameFromSId(
              params.mcpServerId
            );
            if (!serverName) {
              throw new Error(
                `Internal server with id ${params.mcpServerId} do not resolve to a valid name.`
              );
            }
            const serverInfo = getInternalMCPServerInfo(serverName);

            if (bearerTokenCredentials) {
              const authInfo: AuthInfo = {
                token: bearerTokenCredentials.sharedSecret ?? "",
                expiresAt: undefined,
                clientId: "",
                scopes: [],
                extra: {
                  customHeaders:
                    bearerTokenCredentials.customHeaders ?? undefined,
                  connectionType: "workspace",
                },
              };

              client.setAuthInfo(authInfo);
              server.setAuthInfo(authInfo);
            } else if (serverInfo.authorization) {
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
              if (c.isOk()) {
                const authInfo: AuthInfo = {
                  token: c.value.access_token,
                  expiresAt: c.value.access_token_expiry ?? undefined,
                  clientId: "",
                  scopes: [],
                  extra: {
                    ...c.value.connection.metadata,
                    connectionType:
                      params.oAuthUseCase === "personal_actions"
                        ? "personal"
                        : "workspace",
                  },
                };

                client.setAuthInfo(authInfo);
                server.setAuthInfo(authInfo);
              } else {
                if (params.oAuthUseCase === "platform_actions") {
                  const workspaceConnectionRes =
                    await MCPServerConnectionResource.findByMCPServer(auth, {
                      mcpServerId: params.mcpServerId,
                      connectionType: "workspace",
                    });

                  if (
                    workspaceConnectionRes.isOk() &&
                    workspaceConnectionRes.value.credentialId
                  ) {
                    const authInfo: AuthInfo = {
                      token: "",
                      expiresAt: undefined,
                      clientId: "",
                      scopes: [],
                      extra: {
                        credentialId: workspaceConnectionRes.value.credentialId,
                        connectionType: "workspace",
                      },
                    };

                    client.setAuthInfo(authInfo);
                    server.setAuthInfo(authInfo);
                    break;
                  }
                }

                // For now, keeping iso.
                logger.warn(
                  {
                    workspaceId: auth.getNonNullableWorkspace().sId,
                    mcpServerId: params.mcpServerId,
                    oAuthUseCase: params.oAuthUseCase,
                    error: c.error,
                  },
                  "Internal server requires workspace authentication but no connection found"
                );

                const scope = serverInfo.authorization.scope;

                if (params.oAuthUseCase === "personal_actions") {
                  // Check if admin connection exists for the server.
                  // We only check if the connection resource exists (not if the token is valid)
                  // because for personal_actions we just need to know if admin setup is done.
                  const adminConnectionRes =
                    await MCPServerConnectionResource.findByMCPServer(auth, {
                      mcpServerId: params.mcpServerId,
                      connectionType: "workspace",
                    });
                  if (
                    adminConnectionRes.isErr() &&
                    adminConnectionRes.error.code === "connection_not_found"
                  ) {
                    return new Err(
                      new MCPServerRequiresAdminAuthenticationError(
                        params.mcpServerId,
                        serverInfo.authorization.provider,
                        scope
                      )
                    );
                  }
                  return new Err(
                    new MCPServerPersonalAuthenticationRequiredError(
                      params.mcpServerId,
                      serverInfo.authorization.provider,
                      scope
                    )
                  );
                } else if (params.oAuthUseCase === "platform_actions") {
                  // Workspace connection required — admin must set up or reconnect.
                  return new Err(
                    new MCPServerRequiresAdminAuthenticationError(
                      params.mcpServerId,
                      serverInfo.authorization.provider,
                      scope
                    )
                  );
                } else {
                  assertNever(params.oAuthUseCase);
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

          const tokenRes = await resolveRemoteServerOAuthToken(auth, {
            mcpServerId: params.mcpServerId,
            oAuthUseCase: params.oAuthUseCase,
            remoteMCPServer,
            isToolExecution: !!(
              agentLoopContext?.runContext || allowDirectToolExecution
            ),
          });
          if (tokenRes.isErr()) {
            return tokenRes;
          }
          const { token, oauthConnectionType, oauthConnectionId } =
            tokenRes.value;

          const {
            dispatcher,
            fetch: proxyFetch,
            proxyKind,
          } = await createMCPProxyConfig(auth, url.hostname);

          try {
            const req = {
              requestInit: {
                // Include stored custom headers
                headers: remoteMCPServer.customHeaders ?? {},
                dispatcher,
              },
              authProvider: new MCPOAuthProvider(token),
              fetch: proxyFetch,
            };

            await connectToRemoteMCPServer(mcpClient, url, req);
          } catch (e: unknown) {
            // When the MCP SDK receives a 401/403 from the remote server, it
            // calls unimplemented methods on MCPOAuthProvider which throw
            // MCPOAuthProviderError. This reliably indicates token rejection.
            if (
              e instanceof MCPOAuthProviderError &&
              remoteMCPServer.authorization &&
              oauthConnectionType
            ) {
              if (oauthConnectionId) {
                invalidateOAuthConnectionAccessTokenCache(oauthConnectionId);
              }
              const scope = remoteMCPServer.authorization.scope;
              if (oauthConnectionType === "personal") {
                return new Err(
                  new MCPServerPersonalAuthenticationRequiredError(
                    params.mcpServerId,
                    remoteMCPServer.authorization.provider,
                    scope
                  )
                );
              }
              return new Err(
                new MCPServerRequiresAdminAuthenticationError(
                  params.mcpServerId,
                  remoteMCPServer.authorization.provider,
                  scope
                )
              );
            }

            logger.error(
              {
                mcpServerId: params.mcpServerId,
                oauthConnectionType,
                proxyKind,
                serverType,
                targetHost: url.hostname,
                targetUrlOrigin: url.origin,
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
      let url: URL;
      try {
        url = new URL(params.remoteMCPServerUrl);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        return new Err(
          new Error(
            "Invalid MCP server URL. Please provide a valid URL starting with http:// or https://"
          )
        );
      }
      const { dispatcher, fetch: proxyFetch } = await createMCPProxyConfig(
        auth,
        url.hostname
      );
      const req = {
        requestInit: {
          dispatcher,
          headers: { ...(params.headers ?? {}) },
        },
        authProvider: new MCPOAuthProvider(),
        fetch: proxyFetch,
      };
      try {
        await connectToRemoteMCPServer(mcpClient, url, req);

        // Test if OAuth is required - some servers allow connect() but require auth for operations
        await mcpClient.listTools();
      } catch (e: unknown) {
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
        await mcpClient.connect(transport, {
          timeout: CLIENT_SIDE_CONNECT_TIMEOUT_MS,
        });
      } catch (e: unknown) {
        logger.error(
          {
            connectionType,
            workspaceId: auth.getNonNullableWorkspace().sId,
            error: e,
          },
          "Error establishing connection to client side MCP server"
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
}

// Try to connect via streamableHttpTransport first, and if that fails, fall back to sseTransport.
// If the URL path ends with /sse, skip HTTP streaming and use SSE directly.
async function connectToRemoteMCPServer(
  mcpClient: Client,
  url: URL,
  req: SSEClientTransportOptions | StreamableHTTPClientTransportOptions
) {
  // If the URL path ends with /sse, use SSE transport directly.
  if (url.pathname.endsWith("/sse")) {
    const sseTransport = new SSEClientTransport(url, req);
    return mcpClient.connect(sseTransport);
  }

  try {
    const streamableHttpTransport = new StreamableHTTPClientTransport(url, req);
    await mcpClient.connect(streamableHttpTransport, {
      // The default timeout is 60 seconds, which may exceed the heartbeat timeout.
      timeout: DEFAULT_MCP_CLIENT_CONNECT_TIMEOUT_MS,
    });
  } catch (error) {
    // Check if the error message contains "HTTP 4xx" as suggested by the official doc.
    // Doc is here https://github.com/modelcontextprotocol/typescript-sdk?tab=readme-ov-file#client-side-compatibility.
    if (
      error instanceof Error &&
      /HTTP 4\d\d/.test(error.message) &&
      !error.message.includes("HTTP 429")
    ) {
      logger.info(
        {
          url: url.toString(),
          error,
        },
        "Error establishing connection to remote MCP server via streamableHttpTransport, falling back to sseTransport."
      );
      const sseTransport = new SSEClientTransport(url, req);
      return mcpClient.connect(sseTransport, {
        timeout: DEFAULT_MCP_CLIENT_CONNECT_TIMEOUT_MS,
      });
    }
    throw error;
  }
}

export function extractMetadataFromTools(tools: Tool[]): MCPToolType[] {
  return tools.map(({ name, description, inputSchema }) => {
    return {
      name,
      description: description ?? "",
      // TODO: the types are slightly incompatible: we have an unknown as the values of `properties`
      //  whereas JSONSchema expects a JSONSchema7Definition.
      inputSchema: inputSchema as JSONSchema,
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

    const toolsResult = await mcpClient.listTools();
    const serverTools = extractMetadataFromTools(toolsResult.tools);

    return new Ok({
      name: serverVersion?.name ?? DEFAULT_MCP_ACTION_NAME,
      version: serverVersion?.version ?? DEFAULT_MCP_ACTION_VERSION,
      description: serverVersion?.description ?? DEFAULT_MCP_ACTION_DESCRIPTION,
      icon: DEFAULT_MCP_SERVER_ICON,
      authorization: null,
      documentationUrl: null,
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
