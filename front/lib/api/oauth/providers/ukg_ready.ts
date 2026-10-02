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
import { isValidUrl } from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { ParsedUrlQuery } from "querystring";

export class UkgReadyOAuthProvider implements BaseOAuthStrategyProvider {
  requiresWorkspaceConnectionForPersonalAuth = true;

  setupUri({ connection }: { connection: OAuthConnectionType }) {
    const instanceUrl = connection.metadata.instance_url;
    const companyId = connection.metadata.ukg_ready_company_id;
    const clientId = connection.metadata.client_id;
    const codeChallenge = connection.metadata.code_challenge;

    if (!instanceUrl) {
      throw new Error("Missing instance_url in connection metadata");
    }
    if (!companyId) {
      throw new Error("Missing ukg_ready_company_id in connection metadata");
    }
    if (!clientId) {
      throw new Error("Missing client_id in connection metadata");
    }
    if (!codeChallenge) {
      throw new Error("Missing PKCE code_challenge in connection metadata");
    }

    // Build UKG Ready authorization URL
    // Use !{companyId} format per UKG Ready docs for company reference
    const authUrl = new URL(
      `${instanceUrl.replace(/\/$/, "")}/ta/rest/v2/companies/!${companyId}/oauth2/authorize`
    );

    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set(
      "redirect_uri",
      finalizeUriForProvider({ provider: "ukg_ready", connection })
    );
    authUrl.searchParams.set("state", connection.connection_id);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    return authUrl.toString();
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      // Existing workspace connection already has client_id / instance / company id.
      if (extraConfig.mcp_server_id) {
        return true;
      }
    }

    // PKCE OAuth flow needs: client_id, instance_url, and ukg_ready_company_id
    if (
      !extraConfig.client_id ||
      !extraConfig.instance_url ||
      !extraConfig.ukg_ready_company_id
    ) {
      return false;
    }

    // Validate instance_url is a valid URL
    return isValidUrl(extraConfig.instance_url);
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

    // PKCE OAuth flow only needs client_id (no client_secret)
    return new Ok({
      content: {
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
    // Generate PKCE parameters for the OAuth flow
    const { code_verifier, code_challenge } = await getPKCEConfig();

    if (useCase === "personal_actions" || useCase === "platform_actions") {
      const { mcp_server_id, ...restConfig } = extraConfig;

      if (mcp_server_id) {
        const connectionRes = await getWorkspaceOAuthConnectionForMCPServer(
          auth,
          mcp_server_id
        );
        if (connectionRes.isOk()) {
          const connection = connectionRes.value;
          return {
            ...restConfig,
            client_id: connection.metadata.client_id,
            instance_url: connection.metadata.instance_url,
            ukg_ready_company_id: connection.metadata.ukg_ready_company_id,
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

    // Return config with PKCE parameters
    return {
      ...extraConfig,
      code_verifier,
      code_challenge,
    };
  }
}
