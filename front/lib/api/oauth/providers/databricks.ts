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
import logger from "@app/logger/logger";
import type {
  ExtraConfigType,
  OAuthConnectionType,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { ParsedUrlQuery } from "querystring";
import querystring from "querystring";

export class DatabricksOAuthProvider implements BaseOAuthStrategyProvider {
  requiresWorkspaceConnectionForPersonalAuth = true;

  setupUri({
    connection,
    clientId,
    extraConfig,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    clientId?: string;
    extraConfig?: ExtraConfigType;
  }) {
    if (!extraConfig || !extraConfig.databricks_workspace_url) {
      throw new Error("Missing workspace URL for Databricks");
    }

    if (!clientId) {
      throw new Error("Missing client ID for Databricks");
    }

    const workspaceUrl = extraConfig.databricks_workspace_url;
    const scopes = ["sql", "offline_access"];

    const qs = querystring.stringify({
      response_type: "code",
      client_id: clientId,
      state: connection.connection_id,
      redirect_uri: finalizeUriForProvider("databricks"),
      scope: scopes.join(" "),
    });

    const authUrl = `${workspaceUrl.trim().replace(/\/$/, "")}/oidc/v1/authorize?${qs}`;
    return authUrl;
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
      // everything we need, otherwise we'll need the client_id, client_secret, and databricks_workspace_url.
      if (extraConfig.mcp_server_id) {
        return true;
      }
    } else if (useCase === "platform_actions") {
      return !!(
        extraConfig.client_id &&
        extraConfig.client_secret &&
        extraConfig.databricks_workspace_url
      );
    }
    return Object.keys(extraConfig).length === 0;
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
      // we have client_secret (initial admin setup).
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
        const connectionRes = await oauthApi.getAccessToken({
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

    // Validate that both are strings before using them
    if (!isString(client_secret) || !isString(extraConfig.client_id)) {
      return new Err({
        code: "credential_retrieval_failed",
        message: "Missing or invalid client_id or client_secret in extraConfig",
      });
    }

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
      // we have client_secret (initial admin setup).
      const { mcp_server_id, ...restConfig } = extraConfig;

      if (mcp_server_id) {
        const oauthConnectionIdRes =
          await getWorkspaceOAuthConnectionIdForMCPServer(auth, mcp_server_id);
        if (oauthConnectionIdRes.isErr()) {
          throw new Error(oauthConnectionIdRes.error.message);
        }

        const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        const connectionRes = await oauthApi.getAccessToken({
          connectionId: oauthConnectionIdRes.value,
        });
        if (connectionRes.isErr()) {
          throw new Error(
            "Failed to get connection metadata: " + connectionRes.error.message
          );
        }
        const connection = connectionRes.value.connection;

        return {
          client_id: connection.metadata.client_id,
          databricks_workspace_url:
            connection.metadata.databricks_workspace_url,
          ...restConfig,
        };
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- we filter out the client_secret from the extraConfig.
    const { client_secret, ...restConfig } = extraConfig;

    return restConfig;
  }
}
