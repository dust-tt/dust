import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import {
  AuthError,
  AuthService,
  getDustDomain,
  getConnectionDetails,
  type OAuthAuthorizeResponse,
  type StoredTokens,
  type StoredUser,
} from "@app/shared/services/auth";
import type { StorageService } from "@app/shared/services/storage";

// Use mobile's config which has dev defaults
import { DEFAULT_DUST_API_DOMAIN } from "@/lib/config";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import { decodeJWT, normalizeError } from "@app/shared/lib/utils";

// Re-export types for convenience
export type { StoredTokens, StoredUser, OAuthAuthorizeResponse };
export { AuthError };

// Proactive refresh window - refresh tokens 60 seconds before they expire
const PROACTIVE_REFRESH_WINDOW_MS = 60_000;

// In-memory token cache (SecureStore is async/slow for hot-path reads)
let cachedTokens: StoredTokens | null = null;

// Deduplication lock for parallel refresh calls
let refreshPromise: Promise<Result<StoredTokens, AuthError>> | null = null;

// PKCE utilities
function base64URLEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64ToBase64URL(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generatePKCE(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  // Generate 32 cryptographically random bytes for code verifier
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const codeVerifier = base64URLEncode(randomBytes);

  // SHA-256 hash the verifier for the challenge
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  const codeChallenge = base64ToBase64URL(digest);

  return { codeVerifier, codeChallenge };
}

const DEFAULT_TOKEN_EXPIRY_IN_SECONDS = 5 * 60;

export class MobileAuthService extends AuthService {
  constructor(storage: StorageService) {
    super(storage);
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
      return new Err(
        new AuthError("not_authenticated", "Authentication was cancelled")
      );
    }

    if (result.type !== "success") {
      return new Err(
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
      return new Err(
        new AuthError("not_authenticated", `OAuth error: ${error}`)
      );
    }

    if (!code) {
      return new Err(
        new AuthError("not_authenticated", "No authorization code received")
      );
    }

    // Exchange code for tokens
    const tokenResponse = await this.exchangeCodeForTokens(
      code,
      codeVerifier,
      redirectUri
    );

    if (tokenResponse.isErr()) {
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

    if (meResult.isErr()) {
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

    return new Ok({ tokens, user });
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
      return new Err(
        new AuthError("not_authenticated", normalizeError(err).message)
      );
    }

    const data = await response.json();

    if (!response.ok) {
      return new Err(
        new AuthError(
          "not_authenticated",
          `Token exchange failed: ${data.error} - ${data.error_description}`
        )
      );
    }

    return new Ok({
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in ?? DEFAULT_TOKEN_EXPIRY_IN_SECONDS,
      authentication_method: data.authentication_method,
    });
  }

  async refreshToken(
    tokens: StoredTokens | null
  ): Promise<Result<StoredTokens, AuthError>> {
    if (!tokens) {
      tokens = await this.getStoredTokens();
    }
    if (!tokens) {
      return new Err(new AuthError("not_authenticated", "No tokens found"));
    }

    const user = await this.getStoredUser();
    if (!user) {
      return new Err(new AuthError("not_authenticated", "No user found"));
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
      return new Err(
        new AuthError("not_authenticated", normalizeError(err).message)
      );
    }

    const data = await response.json();

    if (!response.ok) {
      return new Err(
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

    return new Ok(newTokens);
  }

  async getAccessToken(forceRefresh?: boolean): Promise<string | null> {
    // Hot path: check in-memory cache first
    if (
      !forceRefresh &&
      cachedTokens &&
      cachedTokens.expiresAt > Date.now() + PROACTIVE_REFRESH_WINDOW_MS
    ) {
      return cachedTokens.accessToken;
    }

    // Load from storage if no cache
    if (!cachedTokens) {
      cachedTokens = await this.getStoredTokens();
    }

    if (!cachedTokens) {
      return null;
    }

    // Check if still fresh after loading from storage
    if (
      !forceRefresh &&
      cachedTokens.expiresAt > Date.now() + PROACTIVE_REFRESH_WINDOW_MS
    ) {
      return cachedTokens.accessToken;
    }

    // Need refresh — deduplicate concurrent calls
    if (!refreshPromise) {
      refreshPromise = this.refreshToken(cachedTokens);
    }

    const result = await refreshPromise;
    refreshPromise = null;

    if (result.isOk()) {
      cachedTokens = result.value;
      return cachedTokens.accessToken;
    }

    // Refresh failed, clear cache
    cachedTokens = null;
    return null;
  }

  async logout(): Promise<boolean> {
    try {
      // Clear in-memory cache
      cachedTokens = null;
      refreshPromise = null;
      await this.storage.clear();
      return true;
    } catch {
      return false;
    }
  }

  // Override saveTokens to also update in-memory cache
  async saveTokens(rawTokens: OAuthAuthorizeResponse) {
    const tokens: StoredTokens = {
      accessToken: rawTokens.accessToken,
      refreshToken: rawTokens.refreshToken,
      expiresAt: Date.now() + rawTokens.expiresIn * 1000,
    };

    // Update in-memory cache immediately
    cachedTokens = tokens;

    for (const [key, value] of Object.entries(tokens)) {
      await this.storage.set(key, value);
    }

    return tokens;
  }

  // Mobile-specific method for workspace switching
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
