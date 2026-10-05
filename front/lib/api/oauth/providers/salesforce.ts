import type { OAuthError } from "@app/lib/api/oauth";
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
import type { Authenticator } from "@app/lib/auth";
import { getPKCEConfig } from "@app/lib/utils/pkce";
import type {
  ExtraConfigType,
  OAuthConnectionType,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import { isValidSalesforceDomain } from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { ParsedUrlQuery } from "querystring";

export class SalesforceOAuthProvider implements BaseOAuthStrategyProvider {
  requiresWorkspaceConnectionForPersonalAuth = true;

  setupUri({
    connection,
    clientId,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    clientId?: string;
  }) {
    if (!connection.metadata.instance_url) {
      throw new Error("Missing Salesforce instance URL");
    }
    if (
      !connection.metadata.code_verifier ||
      !connection.metadata.code_challenge
    ) {
      throw new Error("Missing PKCE code verifier or challenge");
    }

    if (!clientId) {
      throw new Error("Missing Salesforce client ID");
    }
    return (
      `${connection.metadata.instance_url}/services/oauth2/authorize` +
      `?response_type=code` +
      `&client_id=${clientId}` +
      `&state=${connection.connection_id}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider({ provider: "salesforce", connection }))}` +
      `&code_challenge=${connection.metadata.code_challenge}` +
      `&code_challenge_method=S256`
    );
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      // Existing workspace connection already has instance_url / client credentials.
      if (extraConfig.mcp_server_id) {
        return true;
      }
    }

    if (!extraConfig.instance_url || !extraConfig.client_id) {
      return false;
    }
    return isValidSalesforceDomain(extraConfig.instance_url);
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
        const connectionRes = await getWorkspaceOAuthConnectionForMCPServer(
          auth,
          mcp_server_id
        );
        if (connectionRes.isOk()) {
          const connection = connectionRes.value;
          return new Ok({
            content: {
              from_connection_id: connection.connection_id,
            },
            metadata: { workspace_id: workspaceId, user_id: userId },
            redirectUri: connection.redirect_uri,
          });
        }
        if (
          !shouldFallThroughPlatformWorkspaceReuse({
            useCase,
            error: connectionRes.error,
          })
        ) {
          return new Err({
            code: "credential_retrieval_failed",
            message: connectionRes.error.message,
            ...(connectionRes.error.kind === "oauth_metadata_failed" &&
            connectionRes.error.oAuthAPIError
              ? { oAuthAPIError: connectionRes.error.oAuthAPIError }
              : {}),
          });
        }
        // platform_actions first connect only: no workspace connection yet.
      }
    }

    const { client_secret } = extraConfig;

    return new Ok({
      content: {
        client_secret,
        client_id: extraConfig.client_id,
      },
      metadata: { workspace_id: workspaceId, user_id: userId },
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
      const { mcp_server_id, ...restConfig } = extraConfig;

      if (mcp_server_id) {
        const connectionRes = await getWorkspaceOAuthConnectionForMCPServer(
          auth,
          mcp_server_id
        );
        if (connectionRes.isOk()) {
          const connection = connectionRes.value;
          const { code_verifier, code_challenge } = await getPKCEConfig();

          return {
            ...restConfig,
            client_id: connection.metadata.client_id,
            instance_url: connection.metadata.instance_url,
            code_verifier,
            code_challenge,
          };
        }
        if (
          !shouldFallThroughPlatformWorkspaceReuse({
            useCase,
            error: connectionRes.error,
          })
        ) {
          throw new Error(connectionRes.error.message);
        }
        // platform_actions first connect only: no workspace connection yet.
      }
    }

    const { code_verifier, code_challenge } = await getPKCEConfig();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- we filter out the client_secret from the extraConfig.
    const { client_secret, ...restConfig } = extraConfig;

    return {
      ...restConfig,
      code_verifier,
      code_challenge,
    };
  }
}
