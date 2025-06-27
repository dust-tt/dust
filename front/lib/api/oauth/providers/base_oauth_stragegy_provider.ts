import type { ParsedUrlQuery } from "querystring";

import type { Authenticator } from "@app/lib/auth";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { Result } from "@app/types";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import type { OAuthUseCase } from "@app/types/oauth/lib";

// Use this if you need to associate credentials with the connection (eg: custom client_secret).
// You need to return an updatedConfig (usually because you remove the secret that you added to credentials).
export type UpdatedExtraConfigAndRelatedCredential = {
  updatedConfig: ExtraConfigType;
  credential: {
    content: Record<string, string>;
    metadata: { workspace_id: string; user_id: string };
  };
};

export function isUpdatedExtraConfigAndRelatedCredential(
  result: UpdatedExtraConfigAndRelatedCredential | UpdatedExtraConfig
): result is UpdatedExtraConfigAndRelatedCredential {
  return (
    "credential" in result &&
    result.credential !== undefined &&
    "updatedConfig" in result &&
    result.updatedConfig !== undefined
  );
}

// Use this if you just want to enrich the config (eg: add PKCE, some metadata..)
export type UpdatedExtraConfig = {
  updatedConfig: ExtraConfigType;
};

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

  // If the provider has a method for getting the related credential and/or if we need to update the config.
  updateConfigAndGetRelatedCredential?: (
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
  ) => Promise<
    UpdatedExtraConfigAndRelatedCredential | UpdatedExtraConfig | null
  >;

  isExtraConfigValidPostRelatedCredential?: (
    extraConfig: ExtraConfigType,
    useCase: OAuthUseCase
  ) => boolean;

  checkConnectionValidPostFinalize?: (
    connection: OAuthConnectionType
  ) => Result<void, { message: string }>;
}
