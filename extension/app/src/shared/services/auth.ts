import type { Result, WorkspaceType } from "@dust-tt/client";
import type { StoredTokens, StoredUser } from "@extension/lib/storage";

type AuthErrorCode =
  | "user_not_found"
  | "sso_enforced"
  | "not_authenticated"
  | "invalid_oauth_token_error"
  | "expired_oauth_token_error";

export class AuthError extends Error {
  readonly type = "AuthError";
  constructor(
    readonly code: AuthErrorCode,
    msg?: string
  ) {
    super(msg);
  }
}

export const SUPPORTED_ENTERPRISE_CONNECTIONS_STRATEGIES = [
  "okta",
  "samlp",
  "waad",
];

export interface AuthService {
  login(
    isForceLogin?: boolean,
    forcedConnection?: string
  ): Promise<Result<{ tokens: StoredTokens; user: StoredUser }, AuthError>>;
  logout(): Promise<boolean>;

  refreshToken(
    tokens?: StoredTokens | null
  ): Promise<Result<StoredTokens, AuthError>>;

  getAccessToken(): Promise<string | null>;
}

export function makeEnterpriseConnectionName(workspaceId: string) {
  return `workspace-${workspaceId}`;
}

export function isValidEnterpriseConnectionName(
  user: StoredUser,
  workspace: WorkspaceType
) {
  if (!workspace.ssoEnforced) {
    return true;
  }

  return (
    SUPPORTED_ENTERPRISE_CONNECTIONS_STRATEGIES.includes(
      user.connectionStrategy
    ) && makeEnterpriseConnectionName(workspace.sId) === user.connection
  );
}
