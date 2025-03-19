import {
  AUTH0_CLAIM_NAMESPACE,
  DEFAULT_DUST_API_DOMAIN,
  DUST_EU_URL,
  DUST_US_URL,
} from "@app/shared/lib/config";
import {
  sendAuthMessage,
  sendRefreshTokenMessage,
  sentLogoutMessage,
} from "@app/shared/lib/messages";
import type {
  StoredTokens,
  StoredUser,
  UserTypeWithExtensionWorkspaces,
} from "@app/shared/lib/storage";
import {
  clearStoredData,
  getStoredTokens,
  saveTokens,
  saveUser,
} from "@app/shared/lib/storage";
import type { Result, WorkspaceType } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { jwtDecode } from "jwt-decode";

const REGIONS = ["europe-west1", "us-central1"] as const;
export type RegionType = (typeof REGIONS)[number];

const isRegionType = (region: string): region is RegionType =>
  REGIONS.includes(region as RegionType);

const REGION_CLAIM = `${AUTH0_CLAIM_NAMESPACE}region`;
const CONNECTION_STRATEGY_CLAIM = `${AUTH0_CLAIM_NAMESPACE}connection.strategy`;
const WORKSPACE_ID_CLAIM = `${AUTH0_CLAIM_NAMESPACE}workspaceId`;

const DOMAIN_FOR_REGION: Record<RegionType, string> = {
  "us-central1": DUST_US_URL,
  "europe-west1": DUST_EU_URL,
};

export const SUPPORTED_ENTERPRISE_CONNECTIONS_STRATEGIES = [
  "okta",
  "samlp",
  "waad",
];

const log = console.error;

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

// Login sends a message to the background script to call the auth0 login endpoint.
// It saves the tokens in the extension and schedules a token refresh.
// Then it calls the /me route to get the user info.
export const login = async (
  isForceLogin?: boolean,
  forcedConnection?: string
): Promise<Result<{ tokens: StoredTokens; user: StoredUser }, AuthError>> => {
  try {
    const response = await sendAuthMessage(isForceLogin, forcedConnection);
    if (!response.accessToken) {
      throw new Error("No access token received.");
    }
    const tokens = await saveTokens(response);

    const claims = jwtDecode<Record<string, string>>(tokens.accessToken);

    const dustDomain = getDustDomain(claims);
    const connectionDetails = getConnectionDetails(claims);

    const res = await fetchMe(tokens.accessToken, dustDomain);
    if (res.isErr()) {
      return res;
    }
    const workspaces = res.value.user.workspaces;
    const user = await saveUser({
      ...res.value.user,
      ...connectionDetails,
      dustDomain,
      selectedWorkspace: workspaces.length === 1 ? workspaces[0].sId : null,
    });
    return new Ok({ tokens, user });
  } catch (error) {
    return new Err(new AuthError("not_authenticated", error?.toString()));
  }
};

// Logout sends a message to the background script to call the auth0 logout endpoint.
// It also clears the stored tokens in the extension.
export const logout = async (): Promise<boolean> => {
  try {
    const response = await sentLogoutMessage();
    if (!response?.success) {
      throw new Error("No success response received.");
    }
    return true;
  } catch (error) {
    log("Logout failed: Unknown error.", error);
    return false;
  } finally {
    await clearStoredData();
  }
};

// Refresh token sends a message to the background script to call the auth0 refresh token endpoint.
// It updates the stored tokens with the new access token.
// If the refresh token is invalid, it will call handleLogout.
export const refreshToken = async (
  tokens?: StoredTokens | null
): Promise<Result<StoredTokens, AuthError>> => {
  try {
    tokens = tokens ?? (await getStoredTokens());
    if (!tokens) {
      return new Err(new AuthError("not_authenticated", "No tokens found."));
    }
    const response = await sendRefreshTokenMessage(tokens.refreshToken);
    if (!response?.accessToken) {
      return new Err(
        new AuthError("not_authenticated", "No access token received")
      );
    }
    return new Ok(await saveTokens(response));
  } catch (error) {
    log("Refresh token: unknown error.", error);
    return new Err(new AuthError("not_authenticated", error?.toString()));
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  let tokens = await getStoredTokens();
  if (!tokens || !tokens.accessToken || tokens.expiresAt < Date.now()) {
    const refreshRes = await refreshToken(tokens);
    if (refreshRes.isOk()) {
      tokens = refreshRes.value;
    }
  }

  return tokens?.accessToken ?? null;
};

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

const getDustDomain = (claims: Record<string, string>) => {
  const region = claims[REGION_CLAIM];

  return (
    (isRegionType(region) && DOMAIN_FOR_REGION[region]) ||
    DEFAULT_DUST_API_DOMAIN
  );
};

const getConnectionDetails = (claims: Record<string, string>) => {
  const connectionStrategy = claims[CONNECTION_STRATEGY_CLAIM];
  const ws = claims[WORKSPACE_ID_CLAIM];
  return {
    connectionStrategy,
    connection: ws ? makeEnterpriseConnectionName(ws) : undefined,
  };
};

// Fetch me sends a request to the /me route to get the user info.
const fetchMe = async (
  accessToken: string,
  dustDomain: string
): Promise<Result<{ user: UserTypeWithExtensionWorkspaces }, AuthError>> => {
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
};
