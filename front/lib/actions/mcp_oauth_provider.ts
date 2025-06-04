import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import { MCPOAuthRequiredError } from "@app/lib/actions/mcp_oauth_error";
import config from "@app/lib/api/config";
import apiConfig from "@app/lib/api/config";
import { finalizeUriForProvider } from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import type { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types";
import { getOAuthConnectionAccessToken } from "@app/types/oauth/client/access_token";

async function getAccessTokenForRemoteMCPServer(
  auth: Authenticator,
  remoteMCPServer: RemoteMCPServerResource,
  connectionType: MCPServerConnectionConnectionType
) {
  const metadata = remoteMCPServer.toJSON();

  if (metadata.authorization) {
    const connection = await MCPServerConnectionResource.findByMCPServer({
      auth,
      mcpServerId: metadata.sId,
      connectionType,
    });
    if (connection.isOk()) {
      const token = await getOAuthConnectionAccessToken({
        config: apiConfig.getOAuthAPIConfig(),
        logger,
        connectionId: connection.value.connectionId,
      });
      return token.isOk() ? token.value : null;
    }
  }
}

export class MCPOAuthProvider implements OAuthClientProvider {
  private readonly remoteMCPServer: RemoteMCPServerResource | undefined;
  private auth: Authenticator;
  private metadata: OAuthMetadata | undefined;

  constructor(auth: Authenticator, remoteMCPServer?: RemoteMCPServerResource) {
    this.auth = auth;
    this.remoteMCPServer = remoteMCPServer ?? undefined;
  }
  get redirectUrl(): string {
    throw new Error(
      "Method redirectUrl not implemented. We should never reach this point."
    );
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [finalizeUriForProvider("mcp")],
      client_name: "Dust",
      client_uri: config.getClientFacingUrl(),
      logo_uri: "https://avatars.githubusercontent.com/u/116068963?s=200&v=4",
      contacts: ["support@dust.com"],
      tos_uri: config.getClientFacingUrl() + "/terms",
      policy_uri: config.getClientFacingUrl() + "/privacy",
      software_id: "dust",
    };
  }

  saveAuthorizationServerMetadata(
    metadata?: OAuthMetadata
  ): void | Promise<void> {
    // Save for a later step.
    this.metadata = metadata;
  }

  clientInformation(): OAuthClientInformationFull | undefined {
    return undefined;
  }

  saveClientInformation(
    clientInformation: OAuthClientInformationFull
  ): void | Promise<void> {
    if (!this.metadata) {
      // This should never happen.
      throw new Error("Metadata not found, unable to create an oauth flow.");
    }

    if (!clientInformation.client_secret) {
      throw new Error(
        "Client secret not found, unable to create an oauth flow."
      );
    }

    // Raise an error to let the client know that the server requires an OAuth connection.
    // We pass the metadata to the client to allow them to handle the oauth flow.
    throw new MCPOAuthRequiredError({
      client_id: clientInformation.client_id,
      client_secret: clientInformation.client_secret,
      token_endpoint: this.metadata.token_endpoint,
      authorization_endpoint: this.metadata.authorization_endpoint,
      response_types_supported: this.metadata.response_types_supported,
      grant_types_supported: this.metadata.grant_types_supported,
      code_challenge_methods_supported:
        this.metadata.code_challenge_methods_supported,
    });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    if (this.remoteMCPServer) {
      // Case of a remote MCP server with a user-provided bearer token.
      if (this.remoteMCPServer.sharedSecret) {
        return {
          token_type: "bearer",
          access_token: this.remoteMCPServer.sharedSecret,
          refresh_token: undefined,
          expires_in: undefined,
        };
      }

      // TODO(mcp): change this to the correct connection type later.
      // eslint-disable-next-line no-constant-condition
      const connectionType: MCPServerConnectionConnectionType = true
        ? "workspace"
        : "personal";

      // Case of a remote MCP server requiring an OAuth connection.
      const accessToken = await getAccessTokenForRemoteMCPServer(
        this.auth,
        this.remoteMCPServer,
        connectionType
      );

      if (!accessToken) {
        switch (connectionType) {
          case "workspace": {
            // This will let the oauth flow continue to the metadata discovery step.
            return undefined;
          }
          case "personal": {
            throw new Error(
              "For now, personal connections are not supported for remote MCP servers."
            );
          }
          default: {
            assertNever(connectionType);
          }
        }
      }

      return {
        token_type: "bearer",
        access_token: accessToken.access_token,
        refresh_token: undefined,
        expires_in: accessToken.access_token_expiry ?? undefined,
      };
    }

    // If we don't have a remoteMCPServer, it means we are trying to add via an URL.
    // In this case, we don't have any tokens to return.
    return undefined;
  }

  saveTokens() {
    throw new Error(
      "Method saveTokens not implemented. We should never reach this point."
    );
  }

  redirectToAuthorization() {
    throw new Error(
      "Method redirectToAuthorization not implemented. We should never reach this point."
    );
  }

  saveCodeVerifier() {
    throw new Error(
      "Method saveCodeVerifier not implemented. We should never reach this point."
    );
  }

  codeVerifier(): string | Promise<string> {
    throw new Error(
      "Method codeVerifier not implemented. We should never reach this point."
    );
  }
}
