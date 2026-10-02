import type { OAuthError } from "@app/lib/api/oauth";
import { getWorkspaceOAuthConnectionForMCPServer } from "@app/lib/api/oauth/mcp_server_connection_auth";
import type {
  BaseOAuthStrategyProvider,
  RelatedCredential,
} from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import type {
  ExtraConfigType,
  OAuthConnectionType,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { ParsedUrlQuery } from "querystring";
import querystring from "querystring";

export class GmailOAuthProvider implements BaseOAuthStrategyProvider {
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
    if (!extraConfig || !extraConfig.scope) {
      throw new Error("Missing authorization scope");
    }

    const qs = querystring.stringify({
      response_type: "code",
      client_id: clientId,
      state: connection.connection_id,
      redirect_uri: finalizeUriForProvider({ provider: "gmail", connection }),
      scope: extraConfig.scope,
      access_type: "offline",
      prompt: "consent",
    });
    return `https://accounts.google.com/o/oauth2/auth?${qs}`;
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      // Existing workspace connection already has client_id / client_secret.
      if (extraConfig.mcp_server_id) {
        return true;
      }
    }
    if (useCase === "platform_actions") {
      return !!(extraConfig.client_id && extraConfig.client_secret);
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
        if (useCase === "personal_actions") {
          return connectionRes;
        }
        // platform_actions first connect: fall through to caller credentials.
      }
    }

    const { client_secret } = extraConfig;

    return new Ok({
      content: {
        client_secret: client_secret,
        client_id: extraConfig.client_id,
      },
      metadata: { workspace_id: workspaceId, user_id: userId },
    });
  }

  /**
   * @cc [owner:flvndvd,label:security] workspace-client-authoritative
   * For personal_actions / platform_actions Refresh with mcp_server_id, the
   * returned client_id MUST come from the workspace connection, regardless of
   * caller-supplied extraConfig.
   */
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
          return {
            ...restConfig,
            client_id: connection.metadata.client_id,
          };
        }
        if (useCase === "personal_actions") {
          throw new Error(connectionRes.error.message);
        }
        // platform_actions first connect: fall through.
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- we filter out the client_secret from the extraConfig.
    const { client_secret, ...restConfig } = extraConfig;

    return restConfig;
  }
}
