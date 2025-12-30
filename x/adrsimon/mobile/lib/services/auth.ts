import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import {
  DEFAULT_DUST_API_DOMAIN,
  DUST_EU_URL,
  DUST_US_URL,
  WORKOS_CLAIM_NAMESPACE,
} from "@/lib/config";
import { normalizeError } from "@/lib/utils/errors";
import type { StorageService } from "@/lib/services/storage";

// Types
export type Organization = {
  id: string;
  name: string;
};

export type WorkspaceType = {
  sId: string;
  name: string;
  role: string;
  segmentation: string | null;
  ssoEnforced: boolean;
};

export type ExtensionWorkspaceType = WorkspaceType & {
  blacklistedDomains: string[];
};

export type UserType = {
  sId: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string | null;
  image: string | null;
  username: string;
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

export type SupportedEnterpriseConnectionStrategy = "SSO";

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
  | "expired_oauth_token_error"
  | "cancelled";

export class AuthError extends Error {
  readonly type = "AuthError";
  constructor(
    readonly code: AuthErrorCode,
    msg?: string
  ) {
    super(msg);
  }
}

export type Result<T, E> = { isOk: true; value: T } | { isOk: false; error: E };

function Ok<T>(value: T): Result<T, never> {
  return { isOk: true, value };
}

function Err<E>(error: E): Result<never, E> {
  return { isOk: false, error };
}

// PKCE utilities
async function generatePKCE(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const codeVerifier = Crypto.randomUUID() + Crypto.randomUUID();
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  // Convert to URL-safe base64
  const codeChallenge = digest
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return { codeVerifier, codeChallenge };
}

// JWT decode helper (simple implementation for claims extraction)
function decodeJWT(token: string): Record<string, string> {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return {};
  }
}

// Domain helpers
const REGIONS = ["europe-west1", "us-central1"] as const;
type RegionType = (typeof REGIONS)[number];

const REGION_SET: Set<string> = new Set(REGIONS);

function isRegionType(region: string): region is RegionType {
  return REGION_SET.has(region);
}

const DOMAIN_FOR_REGION: Record<RegionType, string> = {
  "us-central1": DUST_US_URL,
  "europe-west1": DUST_EU_URL,
};

const REGION_CLAIM = `${WORKOS_CLAIM_NAMESPACE}region`;
const CONNECTION_STRATEGY_CLAIM = `${WORKOS_CLAIM_NAMESPACE}connection.strategy`;
const WORKSPACE_ID_CLAIM = `${WORKOS_CLAIM_NAMESPACE}workspaceId`;

function getDustDomain(claims: Record<string, string>): string {
  const region = claims[REGION_CLAIM];
  return (
    (isRegionType(region) && DOMAIN_FOR_REGION[region]) ||
    DEFAULT_DUST_API_DOMAIN
  );
}

function makeEnterpriseConnectionName(workspaceId: string): string {
  return `workspace-${workspaceId}`;
}

function isSupportedEnterpriseConnectionStrategy(
  connectionStrategy: string
): connectionStrategy is SupportedEnterpriseConnectionStrategy {
  return connectionStrategy === "SSO";
}

function getConnectionDetails(claims: Record<string, string>) {
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

const DEFAULT_TOKEN_EXPIRY_IN_SECONDS = 5 * 60;

export class MobileAuthService {
  private storage: StorageService;

  constructor(storage: StorageService) {
    this.storage = storage;
  }

  async saveTokens(rawTokens: OAuthAuthorizeResponse): Promise<StoredTokens> {
    const tokens: StoredTokens = {
      accessToken: rawTokens.accessToken,
      refreshToken: rawTokens.refreshToken,
      expiresAt: Date.now() + rawTokens.expiresIn * 1000,
    };

    await Promise.all([
      this.storage.set("accessToken", tokens.accessToken),
      this.storage.set("refreshToken", tokens.refreshToken),
      this.storage.set("expiresAt", tokens.expiresAt),
    ]);

    return tokens;
  }

  async saveUser(user: StoredUser): Promise<StoredUser> {
    await this.storage.set("user", user);
    return user;
  }

  async getStoredTokens(): Promise<StoredTokens | null> {
    const [accessToken, refreshToken, expiresAt] = await Promise.all([
      this.storage.get<string>("accessToken"),
      this.storage.get<string>("refreshToken"),
      this.storage.get<number>("expiresAt"),
    ]);

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
    return this.storage.get<StoredUser>("user");
  }

  private async fetchMe({
    accessToken,
    dustDomain,
  }: {
    accessToken: string;
    dustDomain: string;
  }): Promise<Result<{ user: UserTypeWithExtensionWorkspaces }, AuthError>> {
    const response = await fetch(`${dustDomain}/api/v1/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Request-Origin": "mobile",
      },
    });
    const me = await response.json();

    if (!response.ok) {
      return Err(
        new AuthError(me.error?.type || "not_authenticated", me.error?.message)
      );
    }

    return Ok(me);
  }

  async login({
    forcedConnection,
  }: {
    forcedConnection?: string;
  }): Promise<Result<{ tokens: StoredTokens; user: StoredUser }, AuthError>> {
    const redirectUri = Linking.createURL("auth/callback");

    const { codeVerifier, codeChallenge } = await generatePKCE();

    const authRequestParams: Record<string, string> = {
      response_type: "code",
      redirect_uri: redirectUri,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
      organization_id: forcedConnection ?? "",
      provider: "authkit",
    };

    const queryString = new URLSearchParams(authRequestParams).toString();
    const authUrl = `${DEFAULT_DUST_API_DOMAIN}/api/v1/auth/authorize?${queryString}`;

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

    if (result.type === "cancel" || result.type === "dismiss") {
      return Err(new AuthError("cancelled", "Authentication was cancelled"));
    }

    if (result.type !== "success") {
      return Err(
        new AuthError(
          "not_authenticated",
          `Authentication failed: ${result.type}`
        )
      );
    }

    // Parse the callback URL to get the authorization code
    const url = new URL(result.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      return Err(new AuthError("not_authenticated", `OAuth error: ${error}`));
    }

    if (!code) {
      return Err(
        new AuthError("not_authenticated", "No authorization code received")
      );
    }

    // Exchange code for tokens
    const tokenResponse = await this.exchangeCodeForTokens(
      code,
      codeVerifier,
      redirectUri
    );

    if (!tokenResponse.isOk) {
      return tokenResponse;
    }

    const tokens = await this.saveTokens(tokenResponse.value);
    const claims = decodeJWT(tokens.accessToken);
    const dustDomain = getDustDomain(claims);
    const connectionDetails = getConnectionDetails(claims);

    if (
      tokenResponse.value.authentication_method === "SSO" &&
      !connectionDetails.connectionStrategy
    ) {
      connectionDetails.connectionStrategy =
        tokenResponse.value.authentication_method;
    }

    const meResult = await this.fetchMe({
      accessToken: tokens.accessToken,
      dustDomain,
    });

    if (!meResult.isOk) {
      return meResult;
    }

    const workspaces = meResult.value.user.workspaces;
    const selectedWorkspace =
      workspaces.find((w) => w.sId === meResult.value.user.selectedWorkspace) ||
      workspaces[0];

    const user = await this.saveUser({
      ...meResult.value.user,
      ...connectionDetails,
      dustDomain,
      selectedWorkspace: selectedWorkspace?.sId ?? null,
    });

    return Ok({ tokens, user });
  }

  private async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
    redirectUri: string
  ): Promise<Result<OAuthAuthorizeResponse, AuthError>> {
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
      code,
      redirect_uri: redirectUri,
    });

    let response: Response;
    try {
      response = await fetch(
        `${DEFAULT_DUST_API_DOMAIN}/api/v1/auth/authenticate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: tokenParams.toString(),
        }
      );
    } catch (err) {
      return Err(
        new AuthError("not_authenticated", normalizeError(err).message)
      );
    }

    const data = await response.json();

    if (!response.ok) {
      return Err(
        new AuthError(
          "not_authenticated",
          `Token exchange failed: ${data.error} - ${data.error_description}`
        )
      );
    }

    return Ok({
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in ?? DEFAULT_TOKEN_EXPIRY_IN_SECONDS,
      authentication_method: data.authentication_method,
    });
  }

  async refreshToken(): Promise<Result<StoredTokens, AuthError>> {
    const tokens = await this.getStoredTokens();
    if (!tokens) {
      return Err(new AuthError("not_authenticated", "No tokens found"));
    }

    const user = await this.getStoredUser();
    if (!user) {
      return Err(new AuthError("not_authenticated", "No user found"));
    }

    const tokenParams = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    });

    let response: Response;
    try {
      response = await fetch(`${user.dustDomain}/api/v1/auth/authenticate`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenParams.toString(),
      });
    } catch (err) {
      return Err(
        new AuthError("not_authenticated", normalizeError(err).message)
      );
    }

    const data = await response.json();

    if (!response.ok) {
      return Err(
        new AuthError(
          "not_authenticated",
          `Token refresh failed: ${data.error} - ${data.error_description}`
        )
      );
    }

    const newTokens = await this.saveTokens({
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || tokens.refreshToken,
      expiresIn: data.expires_in ?? DEFAULT_TOKEN_EXPIRY_IN_SECONDS,
    });

    return Ok(newTokens);
  }

  async getAccessToken(forceRefresh?: boolean): Promise<string | null> {
    let tokens = await this.getStoredTokens();

    if (
      !tokens ||
      !tokens.accessToken ||
      tokens.expiresAt < Date.now() ||
      forceRefresh
    ) {
      const refreshResult = await this.refreshToken();
      if (refreshResult.isOk) {
        tokens = refreshResult.value;
      } else {
        return null;
      }
    }

    return tokens?.accessToken ?? null;
  }

  async logout(): Promise<boolean> {
    try {
      await this.storage.clear();
      return true;
    } catch {
      return false;
    }
  }

  async switchWorkspace(workspaceId: string): Promise<StoredUser | null> {
    const user = await this.getStoredUser();
    if (!user) {
      return null;
    }

    const workspace = user.workspaces.find((w) => w.sId === workspaceId);
    if (!workspace) {
      return null;
    }

    const updatedUser: StoredUser = {
      ...user,
      selectedWorkspace: workspaceId,
    };

    return this.saveUser(updatedUser);
  }
}
