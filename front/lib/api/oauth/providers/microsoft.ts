import type { ParsedUrlQuery } from "querystring";
import querystring from "querystring";

import config from "@app/lib/api/config";
import type {
  BaseOAuthStrategyProvider,
  RelatedCredential,
} from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class MicrosoftOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    relatedCredential,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    relatedCredential?: {
      content: Record<string, string>;
      metadata: { workspace_id: string; user_id: string };
    };
  }) {
    const scopes = [
      "User.Read",
      "Sites.Read.All",
      "Directory.Read.All",
      "Files.Read.All",
      "Team.ReadBasic.All",
      "ChannelSettings.Read.All",
      "ChannelMessage.Read.All",
      "offline_access",
    ];
    if (relatedCredential) {
      return `${config.getClientFacingUrl()}/oauth/microsoft/finalize?provider=microsoft&code=client&state=${connection.connection_id}`;
    } else {
      const qs = querystring.stringify({
        response_type: "code",
        client_id: config.getOAuthMicrosoftClientId(),
        state: connection.connection_id,
        redirect_uri: finalizeUriForProvider("microsoft"),
        scope: scopes.join(" "),
      });
      return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${qs}`;
    }
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType) {
    return (
      Object.keys(extraConfig).length === 0 ||
      !!(
        extraConfig.client_id &&
        extraConfig.client_secret &&
        extraConfig.tenant_id
      )
    );
  }
  async getRelatedCredential(
    auth: Authenticator,
    {
      extraConfig,
      workspaceId,
      userId,
    }: {
      extraConfig: ExtraConfigType;
      workspaceId: string;
      userId: string;
    }
  ): Promise<RelatedCredential> {
    const { client_id, client_secret } = extraConfig;
    if (!client_id || !client_secret) {
      throw new Error("Client ID and client secret are required");
    }
    return {
      content: {
        client_id,
        client_secret,
      },
      metadata: { workspace_id: workspaceId, user_id: userId },
    };
  }

  async getUpdatedExtraConfig(
    auth: Authenticator,
    {
      extraConfig,
    }: {
      extraConfig: ExtraConfigType;
    }
  ): Promise<ExtraConfigType> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- we filter out the client_id and client_secret from the extraConfig.
    const { client_secret, ...restConfig } = extraConfig;

    return restConfig;
  }
}
