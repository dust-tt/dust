import type { RegionInfo } from "@app/lib/api/regions/config";
import type { Result } from "@app/types/shared/result";
import { DUST_EU_URL, DUST_US_URL } from "@extension/shared/lib/config";
import type { StorageService } from "@extension/shared/services/storage";

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type OAuthAuthorizeResponse = {
  success: true;
  accessToken: string;
  refreshToken: string;
  expirationDate: number;
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
      expiresAt: rawTokens.expirationDate,
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

  async getSelectedWorkspace(): Promise<string | null> {
    return (await this.storage.get<string>("selectedWorkspace")) ?? null;
  }

  // Abstract methods that must be implemented by platform-specific services
  abstract login(args: {
    forcedConnection?: string;
    organizationId?: string;
  }): Promise<Result<LoginResult, AuthError>>;

  abstract logout(): Promise<boolean>;

  abstract getAccessToken(forceRefresh?: boolean): Promise<string | null>;

  abstract refreshToken(
    tokens: StoredTokens | null
  ): Promise<Result<StoredTokens, AuthError>>;
}

const REGION_CLAIM = `https://dust.tt/region`;

export function getRegionInfoFromClaims(
  claims: Record<string, string>
): RegionInfo {
  const region = claims[REGION_CLAIM];
  const regionName: RegionType = isRegionType(region) ? region : "us-central1";
  return {
    name: regionName,
    url: (isRegionType(region) && DOMAIN_FOR_REGION[region]) || DUST_US_URL,
  };
}

export function makeEnterpriseConnectionName(workspaceId: string) {
  return `workspace-${workspaceId}`;
}

const REGIONS = ["europe-west1", "us-central1"] as const;
type RegionType = (typeof REGIONS)[number];

const isRegionType = (region: string): region is RegionType =>
  REGIONS.includes(region as RegionType);

const DOMAIN_FOR_REGION: Record<RegionType, string> = {
  "us-central1": DUST_US_URL,
  "europe-west1": DUST_EU_URL,
};
