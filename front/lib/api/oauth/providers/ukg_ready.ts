import config from "@app/lib/api/config";
import type { OAuthError } from "@app/lib/api/oauth";
import { getWorkspaceOAuthConnectionIdForMCPServer } from "@app/lib/api/oauth/mcp_server_connection_auth";
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
import logger from "@app/logger/logger";
import type {
  ExtraConfigType,
  OAuthConnectionType,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import { isValidUrl } from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
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
      finalizeUriForProvider("ukg_ready")
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
    if (useCase === "personal_actions") {
      // If we have an mcp_server_id it means the admin already setup the connection and we have
      // everything we need, otherwise we'll need client_id, instance_url, and company_id.
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
    if (useCase === "personal_actions") {
      // For personal actions we reuse the existing connection credential id from the existing
      // workspace connection (setup by admin) if we have it.
      const { mcp_server_id } = extraConfig;

      if (mcp_server_id) {
        const oauthConnectionIdRes =
          await getWorkspaceOAuthConnectionIdForMCPServer(auth, mcp_server_id);
        if (oauthConnectionIdRes.isErr()) {
          return new Err({
            code: "credential_retrieval_failed",
            message: oauthConnectionIdRes.error.message,
          });
        }

        const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        const connectionRes = await oauthApi.getConnectionMetadata({
          connectionId: oauthConnectionIdRes.value,
        });
        if (connectionRes.isErr()) {
          return new Err({
            code: "credential_retrieval_failed",
            message:
              "Failed to get connection metadata: " +
              connectionRes.error.message,
            oAuthAPIError: connectionRes.error,
          });
        }
        const connection = connectionRes.value.connection;
        const connectionId = connection.connection_id;

        return new Ok({
          content: {
            from_connection_id: connectionId,
          },
          metadata: { workspace_id: workspaceId, user_id: userId },
        });
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

    if (useCase === "personal_actions") {
      // For personal actions we reuse the existing connection metadata from the existing
      // workspace connection (setup by admin) if we have it.
      const { mcp_server_id, ...restConfig } = extraConfig;

      if (mcp_server_id) {
        const oauthConnectionIdRes =
          await getWorkspaceOAuthConnectionIdForMCPServer(auth, mcp_server_id);
        if (oauthConnectionIdRes.isErr()) {
          throw new Error(oauthConnectionIdRes.error.message);
        }

        const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        const connectionRes = await oauthApi.getConnectionMetadata({
          connectionId: oauthConnectionIdRes.value,
        });
        if (connectionRes.isErr()) {
          throw new Error(
            "Failed to get connection metadata: " + connectionRes.error.message
          );
        }
        const connection = connectionRes.value.connection;

        // Return config with workspace connection metadata and PKCE parameters
        return {
          ...restConfig,
          client_id: connection.metadata.client_id,
          instance_url: connection.metadata.instance_url,
          ukg_ready_company_id: connection.metadata.ukg_ready_company_id,
          code_verifier,
          code_challenge,
        };
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
