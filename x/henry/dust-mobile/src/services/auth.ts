import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import { jwtDecode } from "jwt-decode";
import type { StoredTokens, StoredUser } from "../types";
import { secureStorage, appStorage } from "./storage";

WebBrowser.maybeCompleteAuthSession();

const DUST_US_URL = "https://dust.tt";
const DEFAULT_TOKEN_EXPIRY_SECONDS = 300; // 5 minutes
const PROACTIVE_REFRESH_WINDOW_MS = 60_000; // 1 minute

// In-memory token cache (SecureStore is async/slow for hot-path reads)
let cachedTokens: StoredTokens | null = null;

// Deduplication lock for parallel refresh calls
let refreshPromise: Promise<StoredTokens | null> | null = null;

const REDIRECT_URI = "dust://auth/callback";

type JWTClaims = {
  sub: string;
  region?: string;
  exp?: number;
};

function getDustDomain(region?: string): string {
  if (region === "europe-west1") {
    return "https://eu.dust.tt";
  }
  return DUST_US_URL;
}

// Generate PKCE code verifier and challenge (same as extension's background.ts)
async function generatePKCE(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  // Generate 32 random bytes for code verifier
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

function base64URLEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64ToBase64URL(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function initiateLogin(
  organizationId?: string
): Promise<StoredTokens | null> {
  const { codeVerifier, codeChallenge } = await generatePKCE();

  // Construct auth URL exactly like the Chrome extension (no client_id)
  const params: Record<string, string> = {
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    provider: "authkit",
  };

  if (organizationId) {
    params.organization_id = organizationId;
  }

  const queryString = new URLSearchParams(params).toString();
  const authUrl = `${DUST_US_URL}/api/v1/auth/authorize?${queryString}`;

  // Open in-app browser, wait for redirect back to our scheme
  const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);

  if (result.type !== "success" || !result.url) {
    return null;
  }

  // Parse the authorization code from the redirect URL
  const url = new URL(result.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return null;
  }

  const tokens = await exchangeCodeForTokens(code, codeVerifier);
  return tokens;
}

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<StoredTokens | null> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
    code,
    redirect_uri: REDIRECT_URI,
  });

  const response = await fetch(`${DUST_US_URL}/api/v1/auth/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const expiresIn = data.expires_in ?? DEFAULT_TOKEN_EXPIRY_SECONDS;
  const tokens: StoredTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  cachedTokens = tokens;
  await secureStorage.setTokens(tokens);
  return tokens;
}

export async function fetchUserAndWorkspaces(
  accessToken: string
): Promise<StoredUser | null> {
  const claims = jwtDecode<JWTClaims>(accessToken);
  const dustDomain = getDustDomain(claims.region);

  const response = await fetch(`${dustDomain}/api/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return null;
  }

  const { user } = await response.json();
  const storedUser: StoredUser = {
    ...user,
    workspaces: user.workspaces ?? [],
    selectedWorkspace: null,
    dustDomain,
  };

  appStorage.setUser(storedUser);
  return storedUser;
}

export async function getAccessToken(): Promise<string | null> {
  // Use cached tokens if fresh
  if (cachedTokens && cachedTokens.expiresAt > Date.now() + PROACTIVE_REFRESH_WINDOW_MS) {
    return cachedTokens.accessToken;
  }

  // Load from storage if no cache
  if (!cachedTokens) {
    cachedTokens = await secureStorage.getTokens();
  }

  if (!cachedTokens) {
    return null;
  }

  // If still fresh after loading from storage
  if (cachedTokens.expiresAt > Date.now() + PROACTIVE_REFRESH_WINDOW_MS) {
    return cachedTokens.accessToken;
  }

  // Need refresh — deduplicate concurrent calls
  if (!refreshPromise) {
    refreshPromise = performRefresh(cachedTokens.refreshToken);
  }

  const refreshed = await refreshPromise;
  refreshPromise = null;

  if (refreshed) {
    return refreshed.accessToken;
  }
  return null;
}

async function performRefresh(
  refreshTokenValue: string
): Promise<StoredTokens | null> {
  const user = appStorage.getUser();
  if (!user) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshTokenValue,
  });

  try {
    const response = await fetch(
      `${user.dustDomain}/api/v1/auth/authenticate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }
    );

    if (!response.ok) {
      cachedTokens = null;
      await secureStorage.clearTokens();
      return null;
    }

    const data = await response.json();
    const expiresIn = data.expires_in ?? DEFAULT_TOKEN_EXPIRY_SECONDS;
    const tokens: StoredTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshTokenValue,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    cachedTokens = tokens;
    await secureStorage.setTokens(tokens);
    return tokens;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  cachedTokens = null;
  await secureStorage.clearTokens();
  appStorage.clearUser();
}

export function checkSSOEnforcement(
  user: StoredUser,
  workspaceId: string
): boolean {
  const workspace = user.workspaces.find((w) => w.sId === workspaceId);
  if (!workspace?.ssoEnforced) return true;

  return (
    user.connectionStrategy === "SSO" &&
    user.connection === `workspace-${workspaceId}`
  );
}
