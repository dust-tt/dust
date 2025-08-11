import type { ParsedUrlQuery } from "querystring";

import type { Authenticator } from "@app/lib/auth";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { Result } from "@app/types";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import type { OAuthUseCase } from "@app/types/oauth/lib";

// Use this if you need to associate credentials with the connection (eg: custom client_secret).
export type RelatedCredential = {
  content: Record<string, string>;
  metadata: { workspace_id: string; user_id: string };
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
  getRelatedCredential?: (
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
  ) => Promise<RelatedCredential | undefined>;

  getUpdatedExtraConfig?: (
    auth: Authenticator,
    {
      extraConfig,
      useCase,
    }: {
      extraConfig: ExtraConfigType;
      useCase: OAuthUseCase;
    }
  ) => Promise<ExtraConfigType>;

  isExtraConfigValidPostRelatedCredential?: (
    extraConfig: ExtraConfigType,
    useCase: OAuthUseCase
  ) => boolean;

  checkConnectionValidPostFinalize?: (
    connection: OAuthConnectionType
  ) =>
    | Result<void, { message: string }>
    | Promise<Result<void, { message: string }>>;
}
