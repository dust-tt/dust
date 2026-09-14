import { type CellInfo, type CellType, isCellType } from "@app/types/cell";
import type { RegionInfo } from "@app/types/region";
import { isRegionType } from "@app/types/region";
import type { Result } from "@app/types/shared/result";
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
  cellInfo: CellInfo;
};

export abstract class AuthService {
  protected storage: StorageService;
  protected cells?: CellInfo[];

  constructor(storage: StorageService, cells?: CellInfo[]) {
    this.storage = storage;
    this.cells = cells;
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

  async getCellInfoFromStorage(): Promise<CellInfo | null> {
    const cellInfo = await this.storage.get<CellInfo>("cellInfo");
    if (cellInfo) {
      return cellInfo;
    }

    // Migrate legacy region-based sessions so token refresh keeps working.
    const regionInfo = await this.storage.get<RegionInfo>("regionInfo");
    if (!regionInfo) {
      return null;
    }

    const migrated = migrateRegionInfoToCellInfo(regionInfo, this.cells);
    if (!migrated) {
      return null;
    }

    await this.storage.set("cellInfo", migrated);
    await this.storage.delete("regionInfo");
    return migrated;
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

const CELL_CLAIM = `https://dust.tt/cell`;
const REGION_CLAIM = `https://dust.tt/region`;

export function getCellInfoFromClaims(
  claims: Record<string, string>,
  cells: CellInfo[]
): CellInfo {
  const cell = claims[CELL_CLAIM];
  if (isCellType(cell)) {
    return cells.find((c) => c.name === cell) ?? cells[0];
  }

  // Backward compatibility for tokens that still carry the region claim.
  const region = claims[REGION_CLAIM];
  if (isRegionType(region)) {
    return cells.find((c) => c.region === region) ?? cells[0];
  }

  return cells[0];
}

function migrateRegionInfoToCellInfo(
  regionInfo: RegionInfo,
  cells?: CellInfo[]
): CellInfo | null {
  if (cells && cells.length > 0) {
    const byUrl = cells.find((c) => c.url === regionInfo.url);
    if (byUrl) {
      return byUrl;
    }
    if (isRegionType(regionInfo.name)) {
      return cells.find((c) => c.region === regionInfo.name) ?? null;
    }
    return null;
  }

  if (!isRegionType(regionInfo.name) || !regionInfo.url) {
    return null;
  }

  // Background scripts may not have the cell catalog; keep the stored URL and
  // map the legacy region onto the primary cell for that region.
  const cellName: CellType =
    regionInfo.name === "europe-west1" ? "cell-00001" : "cell-00000";

  return {
    name: cellName,
    region: regionInfo.name,
    url: regionInfo.url,
  };
}

export function makeEnterpriseConnectionName(workspaceId: string) {
  return `workspace-${workspaceId}`;
}
