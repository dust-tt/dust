import type { RegionInfo } from "@app/lib/api/regions/config";
import type { Result, WorkspaceType } from "@dust-tt/client";
import {
  DEFAULT_DUST_API_DOMAIN,
  DUST_EU_URL,
  DUST_US_URL,
  WORKOS_CLAIM_NAMESPACE,
} from "@extension/shared/lib/config";
import type { StorageService } from "@extension/shared/services/storage";

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type ConnectionDetails = {
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

export type LoginResult = {
  tokens: StoredTokens;
  regionInfo: RegionInfo;
  connectionDetails: ConnectionDetails;
};

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

  async getRegionInfoFromStorage(): Promise<RegionInfo | null> {
    return (await this.storage.get<RegionInfo>("regionInfo")) ?? null;
  }

  async getConnectionDetailsFromStorage(): Promise<ConnectionDetails | null> {
    return (
      (await this.storage.get<ConnectionDetails>("connectionDetails")) ?? null
    );
  }

  async getSelectedWorkspace(): Promise<string | null> {
    return (await this.storage.get<string>("selectedWorkspace")) ?? null;
  }

  // Abstract methods that must be implemented by platform-specific services
  abstract login(args: {
    forcedConnection?: string;
  }): Promise<Result<LoginResult, AuthError>>;

  abstract logout(): Promise<boolean>;

  abstract getAccessToken(forceRefresh?: boolean): Promise<string | null>;

  abstract refreshToken(
    tokens: StoredTokens | null
  ): Promise<Result<StoredTokens, AuthError>>;
}

const REGION_CLAIM = `${WORKOS_CLAIM_NAMESPACE}region`;
const CONNECTION_STRATEGY_CLAIM = `${WORKOS_CLAIM_NAMESPACE}connection.strategy`;
const WORKSPACE_ID_CLAIM = `${WORKOS_CLAIM_NAMESPACE}workspaceId`;

export function getRegionInfoFromClaims(
  claims: Record<string, string>
): RegionInfo {
  const region = claims[REGION_CLAIM];
  const regionName: RegionType = isRegionType(region) ? region : "us-central1";
  return {
    name: regionName,
    url:
      (isRegionType(region) && DOMAIN_FOR_REGION[region]) ||
      DEFAULT_DUST_API_DOMAIN,
  };
}

export function makeEnterpriseConnectionName(workspaceId: string) {
  return `workspace-${workspaceId}`;
}

export function getConnectionDetails(
  claims: Record<string, string>
): ConnectionDetails {
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
  connectionDetails: ConnectionDetails,
  workspace: WorkspaceType
) {
  if (!workspace.ssoEnforced) {
    return true;
  }

  return (
    connectionDetails.connectionStrategy &&
    isSupportedEnterpriseConnectionStrategy(
      connectionDetails.connectionStrategy
    ) &&
    makeEnterpriseConnectionName(workspace.sId) === connectionDetails.connection
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
