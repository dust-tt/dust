import { type CellInfo, type CellType, isCellType } from "@app/types/cell";
import type { RegionInfo } from "@app/types/region";
import { isRegionType } from "@app/types/region";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@extension/shared/lib/utils";
import type { StorageService } from "@extension/shared/services/storage";
import { jwtDecode } from "jwt-decode";
import { z } from "zod";

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

const WorkOSTokensResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expirationDate: z.number(),
  authenticationMethod: z.string().optional(),
});

const WorkOSErrorResponseSchema = z.object({
  error: z.string().optional(),
  type: z.string().optional(),
});

export type WorkOSAuthenticateError = {
  // null when the request got no response (network error).
  status: number | null;
  // The WorkOS error type, e.g. `invalid_grant`.
  type: string | null;
  message: string;
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

  // Saves the tokens of a login, and the cell of the user read from the access token claims.
  async saveLogin(
    rawTokens: OAuthAuthorizeResponse,
    cells: CellInfo[]
  ): Promise<LoginResult> {
    const tokens = await this.saveTokens(rawTokens);
    const claims = jwtDecode<Record<string, string>>(tokens.accessToken);
    const cellInfo = getCellInfoFromClaims(claims, cells);
    await this.storage.set("cellInfo", cellInfo);

    return { tokens, cellInfo };
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

  async clearStoredData(): Promise<void> {
    await Promise.all([
      this.storage.delete("accessToken"),
      this.storage.delete("expiresAt"),
      this.storage.delete("refreshToken"),
      this.storage.delete("cellInfo"),
      this.storage.delete("regionInfo"),
      this.storage.delete("selectedWorkspace"),
    ]);
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

// WorkOS API calls, shared by all platforms (including the Chrome background script).
export async function postWorkOSAuthenticate(
  baseUrl: string,
  params:
    | { code: string; code_verifier: string }
    | { grant_type: "refresh_token"; refresh_token: string }
): Promise<Result<OAuthAuthorizeResponse, WorkOSAuthenticateError>> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(`${baseUrl}/api/workos/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      credentials: "omit",
      body: new URLSearchParams(params),
    });
    body = await response.json().catch(() => null);
  } catch (error) {
    return new Err({
      status: null,
      type: null,
      message: `Network error: ${normalizeError(error).message}`,
    });
  }

  if (!response.ok) {
    const parsed = WorkOSErrorResponseSchema.safeParse(body);
    const detail = parsed.success ? parsed.data.error : undefined;
    return new Err({
      status: response.status,
      type: (parsed.success ? parsed.data.type : undefined) ?? null,
      message: `${response.status}${detail ? ` - ${detail}` : ""}`,
    });
  }

  const parsed = WorkOSTokensResponseSchema.safeParse(body);
  if (!parsed.success) {
    return new Err({
      status: response.status,
      type: null,
      message: "The response does not contain the tokens.",
    });
  }

  return new Ok({
    success: true,
    accessToken: parsed.data.accessToken,
    refreshToken: parsed.data.refreshToken,
    expirationDate: parsed.data.expirationDate,
    authentication_method: parsed.data.authenticationMethod,
  });
}

// Revokes the WorkOS session of the access token (its `sid` claim).
export async function revokeWorkOSSession(
  baseUrl: string,
  accessToken: string
): Promise<Result<void, Error>> {
  try {
    const sessionId = jwtDecode<Record<string, string>>(accessToken).sid;
    if (!sessionId) {
      return new Err(new Error("No session ID found."));
    }

    const response = await fetch(`${baseUrl}/api/workos/revoke-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "omit",
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (!response.ok) {
      return new Err(new Error(`Revoke session failed: ${response.status}`));
    }
    return new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

// Cell helpers.

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
