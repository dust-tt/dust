import {
  DEFAULT_DUST_API_DOMAIN,
  DUST_EU_URL,
  DUST_US_URL,
  WORKOS_CLAIM_NAMESPACE,
} from "@app/shared/lib/config";
import type { StorageService } from "@app/shared/services/storage";
import type {
  ExtensionWorkspaceType,
  Result,
  UserType,
  WorkspaceType,
} from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

export type Organization = {
  id: string;
  name: string;
};

export type UserTypeWithExtensionWorkspaces = UserType & {
  workspaces: ExtensionWorkspaceType[];
  organizations: Organization[];
  selectedWorkspace: string | null;
};

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type StoredUser = UserTypeWithExtensionWorkspaces & {
  selectedWorkspace: string | null;
  dustDomain: string;
  connectionStrategy: SupportedEnterpriseConnectionStrategy | undefined;
  connection?: string;
};

export type OAuthAuthorizeResponse = {
  success: true;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  authentication_method?: string;
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

export abstract class AuthService {
  protected storage: StorageService;

  constructor(storage: StorageService) {
    this.storage = storage;
  }

  // Shared methods with implementation
  async saveTokens(rawTokens: OAuthAuthorizeResponse) {
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

  async saveUser(user: StoredUser): Promise<StoredUser> {
    await this.storage.set("user", user);
    return user;
  }

  async getStoredTokens(): Promise<StoredTokens | null> {
    const accessToken = await this.storage.get<string>("accessToken");
    const refreshToken = await this.storage.get<string>("refreshToken");
    const expiresAt = await this.storage.get<number>("expiresAt");

    if (!accessToken || !expiresAt) {
      return null;
    }

    return {
      accessToken,
      refreshToken: refreshToken || "",
      expiresAt,
    };
  }

  async getStoredUser(): Promise<StoredUser | null> {
    const result = await this.storage.get<StoredUser>("user");
    return result ?? null;
  }

  // Abstract methods that must be implemented by platform-specific services
  abstract login(args: {
    forcedConnection?: string;
  }): Promise<Result<{ tokens: StoredTokens; user: StoredUser }, AuthError>>;

  abstract logout(): Promise<boolean>;

  abstract getAccessToken(forceRefresh?: boolean): Promise<string | null>;

  abstract refreshToken(
    tokens: StoredTokens | null
  ): Promise<Result<StoredTokens, AuthError>>;

  protected async fetchMe({
    accessToken,
    dustDomain,
  }: {
    accessToken: string;
    dustDomain: string;
  }): Promise<Result<{ user: UserTypeWithExtensionWorkspaces }, AuthError>> {
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
}

const REGION_CLAIM = `${WORKOS_CLAIM_NAMESPACE}region`;
const CONNECTION_STRATEGY_CLAIM = `${WORKOS_CLAIM_NAMESPACE}connection.strategy`;
const WORKSPACE_ID_CLAIM = `${WORKOS_CLAIM_NAMESPACE}workspaceId`;

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
    connectionStrategy: isSupportedEnterpriseConnectionStrategy(
      connectionStrategy
    )
      ? connectionStrategy
      : undefined,
    connection: ws ? makeEnterpriseConnectionName(ws) : undefined,
  };
}

export const SUPPORTED_ENTERPRISE_CONNECTIONS_STRATEGIES = ["SSO"] as const;
export type SupportedEnterpriseConnectionStrategy =
  (typeof SUPPORTED_ENTERPRISE_CONNECTIONS_STRATEGIES)[number];

function isSupportedEnterpriseConnectionStrategy(
  connectionStrategy: string
): connectionStrategy is SupportedEnterpriseConnectionStrategy {
  return SUPPORTED_ENTERPRISE_CONNECTIONS_STRATEGIES.includes(
    connectionStrategy as SupportedEnterpriseConnectionStrategy
  );
}

export function isValidEnterpriseConnection(
  user: StoredUser,
  workspace: WorkspaceType
) {
  if (!workspace.ssoEnforced) {
    return true;
  }

  return (
    user.connectionStrategy &&
    isSupportedEnterpriseConnectionStrategy(user.connectionStrategy) &&
    makeEnterpriseConnectionName(workspace.sId) === user.connection
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
