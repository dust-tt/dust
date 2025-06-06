import type { ParsedUrlQuery } from "querystring";

import type { Authenticator } from "@app/lib/auth";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import type { OAuthUseCase } from "@app/types/oauth/lib";

export interface BaseOAuthStrategyProvider {
  setupUri: ({
    connection,
    useCase,
    clientId,
    forceLabelsScope,
    relatedCredential,
    extraConfig,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    clientId?: string;
    forceLabelsScope?: boolean;
    relatedCredential?: {
      content: Record<string, string>;
      metadata: { workspace_id: string; user_id: string };
    };
    extraConfig?: ExtraConfigType;
  }) => string;

  codeFromQuery: (query: ParsedUrlQuery) => string | null;

  connectionIdFromQuery: (query: ParsedUrlQuery) => string | null;

  isExtraConfigValid: (
    extraConfig: ExtraConfigType,
    useCase: OAuthUseCase
  ) => boolean;

  // If the provider has a method for getting the related credential, it must return a cleaned config.
  getRelatedCredential?: (
    auth: Authenticator,
    extraConfig: ExtraConfigType,
    workspaceId: string,
    userId: string,
    useCase: OAuthUseCase
  ) => Promise<{
    credential: {
      content: Record<string, string>;
      metadata: { workspace_id: string; user_id: string };
    };
    cleanedConfig: ExtraConfigType;
  } | null>;

  isExtraConfigValidPostRelatedCredential?: (
    extraConfig: ExtraConfigType,
    useCase: OAuthUseCase
  ) => boolean;
}
