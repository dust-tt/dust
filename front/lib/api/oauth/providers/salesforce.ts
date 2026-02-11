import type { ParsedUrlQuery } from "querystring";

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
import type { ExtraConfigType } from "@app/types/oauth/lib";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";
import { isValidSalesforceDomain } from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("salesforce"))}` +
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
    if (useCase === "personal_actions") {
      // If we have an mcp_server_id it means the admin already setup the connection and we have
      // everything we need, otherwise we'll need the instance_url and client_id.
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
    if (useCase === "personal_actions") {
      // For personal actions we reuse the existing connection credential id from the existing
      // workspace connection (setup by admin) if we have it, otherwise we fallback to assuming
      // we have client_secret and instance_url (initial admin setup).
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
    if (useCase === "personal_actions") {
      // For personal actions we reuse the existing connection credential id from the existing
      // workspace connection (setup by admin) if we have it, otherwise we fallback to assuming
      // we have client_secret and instance_url (initial admin setup).
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

        const { code_verifier, code_challenge } = await getPKCEConfig();

        return {
          ...restConfig,
          client_id: connection.metadata.client_id,
          instance_url: connection.metadata.instance_url,
          code_verifier,
          code_challenge,
        };
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
