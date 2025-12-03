import type { ParsedUrlQuery } from "querystring";

import type {
  BaseOAuthStrategyProvider,
  RelatedCredential,
} from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class VantaOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({ connection }: { connection: OAuthConnectionType }) {
    const finalizeUrl = new URL(finalizeUriForProvider("vanta"));
    finalizeUrl.searchParams.set("state", connection.connection_id);
    finalizeUrl.searchParams.set("code", "client_credentials");
    return finalizeUrl.toString();
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, _useCase: OAuthUseCase) {
    return Boolean(extraConfig.client_id && extraConfig.client_secret);
  }

  async getRelatedCredential(
    _auth: unknown,
    {
      extraConfig,
      workspaceId,
      userId,
    }: {
      extraConfig: ExtraConfigType;
      workspaceId: string;
      userId: string;
      useCase: OAuthUseCase;
    }
  ): Promise<RelatedCredential> {
    return {
      content: {
        client_id: extraConfig.client_id as string,
        client_secret: extraConfig.client_secret as string,
      },
      metadata: { workspace_id: workspaceId, user_id: userId },
    };
  }

  async getUpdatedExtraConfig(): Promise<ExtraConfigType> {
    // Remove sensitive data from config
    return {};
  }
}
