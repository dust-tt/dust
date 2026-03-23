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
import type { ParsedUrlQuery } from "querystring";
import querystring from "querystring";

export class MicrosoftToolsOAuthProvider implements BaseOAuthStrategyProvider {
  requiresWorkspaceConnectionForPersonalAuth = true;

  setupUri({
    connection,
    useCase,
    clientId,
    extraConfig,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    clientId?: string;
    extraConfig?: ExtraConfigType;
  }) {
    if (useCase === "bot") {
      extraConfig = {
        scope:
          "Sites.Read.All Files.Read.All User.Read User.ReadBasic.All Chat.Read Team.ReadBasic.All Channel.ReadBasic.All Organization.Read.All offline_access",
      };
    }

    if (!extraConfig || !extraConfig.scope) {
      throw new Error("Missing authorization scope");
    }

    const qs = querystring.stringify({
      response_type: "code",
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      client_id: clientId || config.getOAuthMicrosoftToolsClientId(),
      state: connection.connection_id,
      redirect_uri: finalizeUriForProvider("microsoft_tools"),
      scope: extraConfig.scope,
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${qs}`;
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions") {
      if (extraConfig.mcp_server_id) {
        return true;
      }
      return !!extraConfig.scope;
    }

    if (useCase === "platform_actions") {
      // Require scope to be specified for Microsoft Tools
      return !!extraConfig.scope;
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
  ): Promise<Result<RelatedCredential, OAuthError> | undefined> {
    if (useCase === "personal_actions") {
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

    const { client_id, client_secret } = extraConfig;

    // No explicit workspace credential to create (default app credentials path).
    if (!client_id || !client_secret) {
      return undefined;
    }

    return new Ok({
      content: {
        client_secret,
        client_id,
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
          ...restConfig,
        };
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- we filter out the client_secret from the extraConfig.
    const { client_secret, ...restConfig } = extraConfig;

    return restConfig;
  }
}
