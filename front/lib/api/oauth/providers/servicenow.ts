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
import { isValidUrl } from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { ParsedUrlQuery } from "querystring";
import querystring from "querystring";

function hasValidClientCredentials(extraConfig: ExtraConfigType): boolean {
  return !!(
    extraConfig.client_id &&
    extraConfig.client_secret &&
    extraConfig.servicenow_instance_url &&
    isValidUrl(extraConfig.servicenow_instance_url)
  );
}

export class ServiceNowOAuthProvider implements BaseOAuthStrategyProvider {
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
    if (!extraConfig || !extraConfig.servicenow_instance_url) {
      throw new Error("Missing instance URL for ServiceNow");
    }

    if (!clientId) {
      throw new Error("Missing client ID for ServiceNow");
    }

    const instanceUrl = extraConfig.servicenow_instance_url;

    const qs = querystring.stringify({
      response_type: "code",
      client_id: clientId,
      state: connection.connection_id,
      redirect_uri: finalizeUriForProvider({
        provider: "servicenow",
        connection,
      }),
    });

    const authUrl = `${instanceUrl.trim().replace(/\/$/, "")}/oauth_auth.do?${qs}`;
    return authUrl;
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      // Existing workspace connection already has instance URL / client credentials.
      if (extraConfig.mcp_server_id) {
        return true;
      }
      return hasValidClientCredentials(extraConfig);
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
    // client_secret must never be persisted in connection metadata (stored unencrypted,
    // unlike credential content) or end up in logs, so strip it unconditionally before
    // any branch below has a chance to forward it through untouched.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- we filter out the client_secret from the extraConfig.
    const { client_secret, ...safeConfig } = extraConfig;

    if (useCase === "personal_actions" || useCase === "platform_actions") {
      const { mcp_server_id, ...restConfig } = safeConfig;

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
            servicenow_instance_url:
              connection.metadata.servicenow_instance_url,
          };
        }
        if (useCase === "personal_actions") {
          throw new Error(connectionRes.error.message);
        }
        // platform_actions first connect: fall through.
      }
    }

    return safeConfig;
  }
}
