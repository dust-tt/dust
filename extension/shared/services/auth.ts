import type { Auth0AuthorizeResponse } from "@app/platforms/chrome/messages";
import {
  AUTH0_CLAIM_NAMESPACE,
  DEFAULT_DUST_API_DOMAIN,
  DUST_EU_URL,
  DUST_US_URL,
} from "@app/shared/lib/config";
import type { StorageService } from "@app/shared/services/storage";
import type {
  ExtensionWorkspaceType,
  Result,
  UserType,
  WorkspaceType,
} from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

export type UserTypeWithExtensionWorkspaces = UserType & {
  workspaces: ExtensionWorkspaceType[];
};

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type StoredUser = UserTypeWithExtensionWorkspaces & {
  selectedWorkspace: string | null;
  dustDomain: string;
  connectionStrategy: SupportedEnterpriseConnectionStrategy;
  connection?: string;
};

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

export interface AuthService {
  login({
    isForceLogin,
    forcedConnection,
  }: {
    isForceLogin?: boolean;
    forcedConnection?: string;
  }): Promise<Result<{ tokens: StoredTokens; user: StoredUser }, AuthError>>;
  logout(): Promise<boolean>;

  getAccessToken(): Promise<string | null>;
  getStoredTokens(): Promise<StoredTokens | null>;
  getStoredUser(): Promise<StoredUser | null>;

  saveTokens(tokens: Auth0AuthorizeResponse): Promise<StoredTokens>;

  fetchMe({
    accessToken,
    dustDomain,
  }: {
    accessToken: string;
    dustDomain: string;
  }): Promise<Result<{ user: UserTypeWithExtensionWorkspaces }, AuthError>>;
}

export class BaseAuthService implements AuthService {
  constructor(protected storage: StorageService) {}

  // Fetch me sends a request to the /me route to get the user info.
  async fetchMe({
    accessToken,
    dustDomain,
  }: {
    accessToken: string;
    dustDomain: string;
  }) {
    const response = await fetch(`${dustDomain}/api/v1/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Request-Origin": "extension",
      },
    });
    const me = await response.json();

    if (!response.ok) {
      return new Err(new AuthError(me.error.type, me.error.message));
    }
    return new Ok(me);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async login(args: {
    isForceLogin?: boolean;
    forcedConnection?: string;
  }): Promise<Result<{ tokens: StoredTokens; user: StoredUser }, AuthError>> {
    throw new Error("Platform specific implementation required.");
  }

  async logout(): Promise<boolean> {
    throw new Error("Platform specific implementation required.");
  }

  async getAccessToken(): Promise<string | null> {
    throw new Error("Platform specific implementation required.");
  }

  async getStoredTokens(): Promise<StoredTokens | null> {
    throw new Error("Platform specific implementation required.");
  }

  async getStoredUser(): Promise<StoredUser | null> {
    throw new Error("Platform specific implementation required.");
  }

  async saveTokens(rawTokens: Auth0AuthorizeResponse): Promise<StoredTokens> {
    const tokens: StoredTokens = {
      accessToken: rawTokens.accessToken,
      refreshToken: rawTokens.refreshToken,
      expiresAt: Date.now() + rawTokens.expiresIn * 1000,
    };

    for (const [key, value] of Object.entries(tokens)) {
      await this.storage.set(key, value);
    }

    return tokens;
  }
}

const REGION_CLAIM = `${AUTH0_CLAIM_NAMESPACE}region`;
const CONNECTION_STRATEGY_CLAIM = `${AUTH0_CLAIM_NAMESPACE}connection.strategy`;
const WORKSPACE_ID_CLAIM = `${AUTH0_CLAIM_NAMESPACE}workspaceId`;

export function getDustDomain(claims: Record<string, string>) {
  const region = claims[REGION_CLAIM];

  return (
    (isRegionType(region) && DOMAIN_FOR_REGION[region]) ||
    DEFAULT_DUST_API_DOMAIN
  );
}

export function makeEnterpriseConnectionName(workspaceId: string) {
  return `workspace-${workspaceId}`;
}

export function getConnectionDetails(claims: Record<string, string>) {
  const connectionStrategy = claims[CONNECTION_STRATEGY_CLAIM];
  const ws = claims[WORKSPACE_ID_CLAIM];
  return {
    connectionStrategy,
    connection: ws ? makeEnterpriseConnectionName(ws) : undefined,
  };
}

export const SUPPORTED_ENTERPRISE_CONNECTIONS_STRATEGIES = [
  "okta",
  "samlp",
  "waad",
] as const;
export type SupportedEnterpriseConnectionStrategy =
  (typeof SUPPORTED_ENTERPRISE_CONNECTIONS_STRATEGIES)[number];

export function isValidEnterpriseConnection(
  user: StoredUser,
  workspace: WorkspaceType
) {
  if (!workspace.ssoEnforced) {
    return true;
  }

  return (
    SUPPORTED_ENTERPRISE_CONNECTIONS_STRATEGIES.includes(
      user.connectionStrategy as SupportedEnterpriseConnectionStrategy
    ) && makeEnterpriseConnectionName(workspace.sId) === user.connection
  );
}

const REGIONS = ["europe-west1", "us-central1"] as const;
type RegionType = (typeof REGIONS)[number];

const isRegionType = (region: string): region is RegionType =>
  REGIONS.includes(region as RegionType);

const DOMAIN_FOR_REGION: Record<RegionType, string> = {
  "us-central1": DUST_US_URL,
  "europe-west1": DUST_EU_URL,
};
