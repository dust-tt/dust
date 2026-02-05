import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SSEClientTransportOptions } from "@modelcontextprotocol/sdk/client/sse.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { StreamableHTTPClientTransportOptions } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import type { ProxyAgent } from "undici";

import {
  getConnectionForMCPServer,
  MCPServerPersonalAuthenticationRequiredError,
  MCPServerRequiresAdminAuthenticationError,
} from "@app/lib/actions/mcp_authentication";
import { MCPServerNotFoundError } from "@app/lib/actions/mcp_errors";
import {
  doesInternalMCPServerRequireBearerToken,
  getServerTypeAndIdFromSId,
} from "@app/lib/actions/mcp_helper";
import { connectToInternalMCPServer } from "@app/lib/actions/mcp_internal_actions";
import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import { extractMetadataFromServerVersion } from "@app/lib/actions/mcp_metadata_extraction";
import { MCPOAuthRequiredError } from "@app/lib/actions/mcp_oauth_error";
import { MCPOAuthProvider } from "@app/lib/actions/mcp_oauth_provider";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { ClientSideRedisMCPTransport } from "@app/lib/api/actions/mcp_client_side";
import type { MCPServerType, MCPToolType } from "@app/lib/api/mcp";
import { isHostUnderVerifiedDomain } from "@app/lib/api/workspace_has_domains";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  getStaticIPProxyAgent,
  getUntrustedEgressAgent,
} from "@app/lib/egress/server";
import { isWorkspaceUsingStaticIP } from "@app/lib/misc";
import { InternalMCPServerCredentialModel } from "@app/lib/models/agent/actions/internal_mcp_server_credentials";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import logger from "@app/logger/logger";
import type { MCPOAuthUseCase, Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";
import { assertNever } from "@app/types/shared/utils/assert_never";

const DEFAULT_MCP_CLIENT_CONNECT_TIMEOUT_MS = 25_000;

// Helper function to get conditional scope based on feature flag
async function getConditionalScope(
  auth: Authenticator,
  provider: string,
  defaultScope?: string
): Promise<string | undefined> {
  const workspace = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(workspace);
  const hasWriteFeature = featureFlags.includes("google_drive_write_enabled");
  const isGoogleDrive = provider === "google_drive";

  if (isGoogleDrive && hasWriteFeature) {
    return "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly";
  }

  return defaultScope;
}

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

async function createMCPDispatcher(
  auth: Authenticator,
  host: string
): Promise<ProxyAgent | undefined> {
  const workspace = auth.getNonNullableWorkspace();

  // Check if workspace should use static IP:
  // 1. Legacy hardcoded check for specific workspaces
  // 2. Domain-based check: host is under any verified domain for this workspace
  const useStaticIP =
    isWorkspaceUsingStaticIP(workspace) ||
    (await isHostUnderVerifiedDomain(auth, host));

  if (useStaticIP) {
    const staticIPProxy = getStaticIPProxyAgent();
    if (staticIPProxy) {
      logger.info(
        { workspaceId: workspace.sId, host, useStaticIP },
        "Using static IP proxy for MCP request"
      );
      return staticIPProxy;
    }
  }

  return getUntrustedEgressAgent();
}

export async function connectToMCPServer(
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
          if (agentLoopContext?.runContext) {
            const bearerTokenCredentials =
              doesInternalMCPServerRequireBearerToken(params.mcpServerId)
                ? await InternalMCPServerCredentialModel.findOne({
                    where: {
                      workspaceId: auth.getNonNullableWorkspace().id,
                      internalMCPServerId: params.mcpServerId,
                    },
                  })
                : null;

            const metadata = extractMetadataFromServerVersion(
              mcpClient.getServerVersion()
            );

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
            } else if (metadata.authorization) {
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

                // Get conditional scope based on feature flag
                const scope = await getConditionalScope(
                  auth,
                  metadata.authorization.provider,
                  metadata.authorization.scope
                );

                if (params.oAuthUseCase === "personal_actions") {
                  // Check if admin connection exists for the server.
                  // We only check if the connection resource exists (not if the token is valid)
                  // because for personal_actions we just need to know if admin setup is done.
                  const adminConnectionRes =
                    await MCPServerConnectionResource.findByMCPServer(auth, {
                      mcpServerId: params.mcpServerId,
                      connectionType: "workspace",
                    });
                  // If no admin connection exists, return an error to display a message to the user saying that the server requires the admin to setup the connection.
                  if (
                    adminConnectionRes.isErr() &&
                    adminConnectionRes.error.message === "connection_not_found"
                  ) {
                    return new Err(
                      new MCPServerRequiresAdminAuthenticationError(
                        params.mcpServerId,
                        metadata.authorization.provider,
                        scope
                      )
                    );
                  }
                  return new Err(
                    new MCPServerPersonalAuthenticationRequiredError(
                      params.mcpServerId,
                      metadata.authorization.provider,
                      scope
                    )
                  );
                } else if (params.oAuthUseCase === "platform_actions") {
                  // For platform actions, we return an error to display a message to the user saying that the server requires the admin to setup the connection.
                  return new Err(
                    new MCPServerRequiresAdminAuthenticationError(
                      params.mcpServerId,
                      metadata.authorization.provider,
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
            if (c.isOk()) {
              token = {
                access_token: c.value.access_token,
                token_type: "bearer",
                expires_in: c.value.access_token_expiry ?? undefined,
                scope: c.value.connection.metadata.scope,
              };
            } else {
              // Get conditional scope based on feature flag
              const scope = await getConditionalScope(
                auth,
                remoteMCPServer.authorization.provider,
                remoteMCPServer.authorization.scope
              );

              if (connectionType === "personal") {
                // Check if admin connection exists for the server.
                const adminConnection = await getConnectionForMCPServer(auth, {
                  mcpServerId: params.mcpServerId,
                  connectionType: "workspace",
                });
                // If no admin connection exists, return an error to display a message to the user saying that the server requires the admin to setup the connection.
                if (
                  adminConnection.isErr() &&
                  adminConnection.error.message === "connection_not_found"
                ) {
                  return new Err(
                    new MCPServerRequiresAdminAuthenticationError(
                      params.mcpServerId,
                      remoteMCPServer.authorization.provider,
                      scope
                    )
                  );
                }
                return new Err(
                  new MCPServerPersonalAuthenticationRequiredError(
                    params.mcpServerId,
                    remoteMCPServer.authorization.provider,
                    scope
                  )
                );
              } else if (connectionType === "workspace") {
                // For platform actions, we return an error to display a message to the user saying that the server requires the admin to setup the connection.
                return new Err(
                  new MCPServerRequiresAdminAuthenticationError(
                    params.mcpServerId,
                    remoteMCPServer.authorization.provider,
                    scope
                  )
                );
              } else {
                assertNever(connectionType);
              }
            }
          }

          try {
            const req = {
              requestInit: {
                // Include stored custom headers
                headers: remoteMCPServer.customHeaders ?? {},
                dispatcher: await createMCPDispatcher(auth, url.hostname),
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
      const req = {
        requestInit: {
          dispatcher: await createMCPDispatcher(auth, url.hostname),
          headers: { ...(params.headers ?? {}) },
        },
        authProvider: new MCPOAuthProvider(auth, undefined),
      };
      try {
        await connectToRemoteMCPServer(mcpClient, url, req);

        // Test if OAuth is required - some servers allow connect() but require auth for operations
        await mcpClient.listTools();
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
