import type { OAuthError } from "@app/lib/api/oauth";
import type { Authenticator } from "@app/lib/auth";
import type {
  ExtraConfigType,
  OAuthConnectionType,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import type { ParsedUrlQuery } from "querystring";

// Use this if you need to associate credentials with the connection (eg: custom client_secret).
export type RelatedCredential = {
  content: Record<string, string>;
  metadata: { workspace_id: string; user_id: string };
};

export interface BaseOAuthStrategyProvider {
  /**
   * When true, personal auth setup (useCase: "personal_actions") requires a
   * workspace-level MCP server connection to already exist.
   *
   * This is used to gate client-side UX (avoid opening the OAuth popup only to
   * immediately fail server-side).
   */
  requiresWorkspaceConnectionForPersonalAuth?: boolean;

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
  // Returns:
  // - Ok(credential) if credentials were successfully retrieved
  // - Err(error) if credentials retrieval failed (e.g., token revoked)
  // - undefined if no related credential is needed for this provider/useCase
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
  ) => Promise<Result<RelatedCredential, OAuthError> | undefined>;

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
