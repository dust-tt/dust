import type { OAuthError } from "@app/lib/api/oauth";
import type { WorkspaceOAuthConnectionLookupError } from "@app/lib/api/oauth/mcp_server_connection_auth";
import {
  getWorkspaceOAuthConnectionForMCPServer,
  shouldFallThroughPlatformWorkspaceReuse,
} from "@app/lib/api/oauth/mcp_server_connection_auth";
import type {
  BaseOAuthStrategyProvider,
  RelatedCredential,
} from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import { shouldUseStaticIpProxy } from "@app/lib/api/workspace_has_domains";
import type { Authenticator } from "@app/lib/auth";
import { getPKCEConfig } from "@app/lib/utils/pkce";
import type { MCPOAuthConnectionMetadataType } from "@app/types/api/oauth/providers/mcp";
import {
  BaseMCPMetadataSchema,
  MCPOAuthConnectionMetadataSchema,
} from "@app/types/api/oauth/providers/mcp";
import type {
  ExtraConfigType,
  OAuthConnectionType,
  OAuthProvider,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { ParsedUrlQuery } from "querystring";
import { z } from "zod";

const MCP_OAUTH_RESPONSE_TYPE = "code";
const MCP_OAUTH_CODE_CHALLENGE_METHOD = "S256";

const MCPMetadataSchema = BaseMCPMetadataSchema.extend({
  code_challenge: z.string(),
  code_verifier: z.string(),
  token_endpoint_auth_method: z.string().optional(),
  // Stamped authoritatively in `getUpdatedExtraConfig` from the final persisted token endpoint;
  // never caller-supplied. Optional because absence fails safe: `core` (and the freshness sync)
  // treat a missing flag as `"false"` (untrusted egress), so a forgotten stamp can never escalate
  // to static IP.
  use_static_ip_proxy: z.enum(["true", "false"]).optional(),
});

type MCPMetadataType = z.infer<typeof MCPMetadataSchema>;

export class MCPOAuthProvider implements BaseOAuthStrategyProvider {
  provider: OAuthProvider = "mcp";
  requiresWorkspaceConnectionForPersonalAuth = true;

  setupUri({
    connection,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    const code_challenge = connection.metadata.code_challenge;
    const client_id = connection.metadata.client_id;
    const authorization_endpoint = connection.metadata.authorization_endpoint;
    const scope = connection.metadata.scope;
    const resource = connection.metadata.resource;

    if (!code_challenge) {
      throw new Error("Missing code challenge");
    }
    if (!client_id) {
      throw new Error("Missing client id");
    }
    if (!authorization_endpoint) {
      throw new Error("Missing authorization endpoint");
    }

    const authUrl = new URL(authorization_endpoint);

    authUrl.searchParams.set("response_type", MCP_OAUTH_RESPONSE_TYPE);
    authUrl.searchParams.set("client_id", client_id);
    authUrl.searchParams.set("code_challenge", code_challenge);
    authUrl.searchParams.set(
      "code_challenge_method",
      MCP_OAUTH_CODE_CHALLENGE_METHOD
    );
    authUrl.searchParams.set(
      "redirect_uri",
      finalizeUriForProvider({ provider: this.provider, connection })
    );
    authUrl.searchParams.set("state", connection.connection_id);

    if (scope) {
      authUrl.searchParams.set("scope", scope);
    }

    if (resource) {
      authUrl.searchParams.set("resource", resource);
    }

    // Google OAuth requires `access_type=offline` to issue a refresh token and
    // `prompt=consent` to ensure it is returned on subsequent authorizations.
    // Without these, Google only issues a short-lived access token (~1 hour)
    // causing MCP connections to drop when the token expires.
    if (authUrl.hostname === "accounts.google.com") {
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
    }

    return authUrl.toString();
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(
    extraConfig: ExtraConfigType,
    useCase: OAuthUseCase
  ): extraConfig is MCPOAuthConnectionMetadataType {
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      // mcp_server_id means we can reuse the workspace connection's stored OAuth
      // metadata (discovery endpoints / static client credentials from first connect).
      // Used for personal inherit and for admin Refresh without rediscovery.
      if (extraConfig.mcp_server_id) {
        return true;
      }
    }

    return MCPOAuthConnectionMetadataSchema.safeParse(extraConfig).success;
  }

  async getRelatedCredential(
    auth: Authenticator,
    {
      extraConfig,
      workspaceId,
      userId,
      useCase,
    }: {
      extraConfig: ExtraConfigType;
      workspaceId: string;
      userId: string;
      useCase: OAuthUseCase;
    }
  ): Promise<Result<RelatedCredential, OAuthError>> {
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      const { mcp_server_id } = extraConfig;

      if (mcp_server_id) {
        const reused = await this.getRelatedCredentialFromWorkspaceConnection(
          auth,
          {
            mcpServerId: mcp_server_id,
            workspaceId,
            userId,
          }
        );
        if (reused.isOk()) {
          return reused;
        }
        if (
          !shouldFallThroughPlatformWorkspaceReuse({
            useCase,
            error: reused.error,
          })
        ) {
          return new Err({
            code: "credential_retrieval_failed",
            message: reused.error.message,
            ...(reused.error.kind === "oauth_metadata_failed" &&
            reused.error.oAuthAPIError
              ? { oAuthAPIError: reused.error.oAuthAPIError }
              : {}),
          });
        }
        // platform_actions first connect only: no workspace connection yet.
      }
    }

    if (useCase === "platform_actions") {
      const { client_secret } = extraConfig;

      const content: { client_id: string; client_secret?: string } = {
        client_id: extraConfig.client_id,
      };

      // Only include client_secret if it's provided
      if (client_secret) {
        content.client_secret = client_secret;
      }

      return new Ok({
        content,
        metadata: { workspace_id: workspaceId, user_id: userId },
      });
    }
    return new Err({
      code: "credential_retrieval_failed",
      message: "MCP oauth provider does not support use case: " + useCase,
    });
  }

  async getUpdatedExtraConfig(
    auth: Authenticator,
    {
      extraConfig,
      useCase,
    }: {
      extraConfig: ExtraConfigType;
      useCase: OAuthUseCase;
    }
  ): Promise<ExtraConfigType> {
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      const {
        mcp_server_id,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- caller-controlled proxy routing is ignored.
        use_static_ip_proxy: _ignoredUseStaticIpProxy,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- never persist secrets in connection metadata.
        client_secret: _ignoredClientSecret,
        ...restConfig
      } = extraConfig;

      if (mcp_server_id) {
        const reused = await this.getUpdatedExtraConfigFromWorkspaceConnection(
          auth,
          {
            mcpServerId: mcp_server_id,
            restConfig,
          }
        );
        if (reused.isOk()) {
          return reused.value;
        }
        if (
          !shouldFallThroughPlatformWorkspaceReuse({
            useCase,
            error: reused.error,
          })
        ) {
          throw new Error(reused.error.message);
        }
        // platform_actions first connect only: no workspace connection yet.
      }

      if (useCase === "platform_actions") {
        const { code_verifier, code_challenge } = await getPKCEConfig();
        const finalConfig: ExtraConfigType = {
          ...restConfig,
          code_challenge,
          code_verifier,
        };

        return {
          ...finalConfig,
          use_static_ip_proxy: String(
            await shouldUseStaticIpProxy(auth, {
              url: finalConfig.token_endpoint,
              relatedMcpServerUrl:
                typeof finalConfig.resource === "string"
                  ? finalConfig.resource
                  : undefined,
            })
          ),
        };
      }
    }
    throw new Error("MCP oauth provider does not support use case: " + useCase);
  }

  private async getRelatedCredentialFromWorkspaceConnection(
    auth: Authenticator,
    {
      mcpServerId,
      workspaceId,
      userId,
    }: {
      mcpServerId: string;
      workspaceId: string;
      userId: string;
    }
  ): Promise<Result<RelatedCredential, WorkspaceOAuthConnectionLookupError>> {
    const connectionRes = await getWorkspaceOAuthConnectionForMCPServer(
      auth,
      mcpServerId
    );
    if (connectionRes.isErr()) {
      return connectionRes;
    }
    const connection = connectionRes.value;

    return new Ok({
      content: {
        from_connection_id: connection.connection_id,
      },
      metadata: { workspace_id: workspaceId, user_id: userId },
      redirectUri: connection.redirect_uri,
    });
  }

  private async getUpdatedExtraConfigFromWorkspaceConnection(
    auth: Authenticator,
    {
      mcpServerId,
      restConfig,
    }: {
      mcpServerId: string;
      restConfig: ExtraConfigType;
    }
  ): Promise<Result<ExtraConfigType, WorkspaceOAuthConnectionLookupError>> {
    const connectionRes = await getWorkspaceOAuthConnectionForMCPServer(
      auth,
      mcpServerId
    );
    if (connectionRes.isErr()) {
      return connectionRes;
    }
    const connection = connectionRes.value;

    const { code_verifier, code_challenge } = await getPKCEConfig();
    const tokenEndpoint = connection.metadata.token_endpoint;

    return new Ok({
      ...restConfig,
      client_id: connection.metadata.client_id,
      token_endpoint: tokenEndpoint,
      authorization_endpoint: connection.metadata.authorization_endpoint,
      scope: connection.metadata.scope,
      resource: connection.metadata.resource,
      token_endpoint_auth_method:
        connection.metadata.token_endpoint_auth_method,
      code_verifier,
      code_challenge,
      use_static_ip_proxy: String(
        await shouldUseStaticIpProxy(auth, {
          url: tokenEndpoint,
          relatedMcpServerUrl: connection.metadata.resource,
        })
      ),
    });
  }

  isExtraConfigValidPostRelatedCredential(
    extraConfig: ExtraConfigType
  ): extraConfig is MCPMetadataType {
    return MCPMetadataSchema.safeParse(extraConfig).success;
  }
}
