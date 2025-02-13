import { Auth0Client } from "@auth0/auth0-spa-js";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { FrontStorageService } from "@extension/front/storage";
import {
  AUTH0_CLAIM_NAMESPACE,
  AUTH0_CLIENT_DOMAIN,
  AUTH0_CLIENT_ID,
  DEFAULT_DUST_API_DOMAIN,
  DUST_API_AUDIENCE,
  DUST_EU_URL,
  DUST_US_URL,
} from "@extension/lib/config";
import type {
  StoredTokens,
  UserTypeWithExtensionWorkspaces,
} from "@extension/lib/storage";
import { getStoredTokens, saveTokens, saveUser } from "@extension/lib/storage";
import { jwtDecode } from "jwt-decode";

import type { AuthService } from "../../shared/services/auth";
import {
  AuthError,
  makeEnterpriseConnectionName,
} from "../../shared/services/auth";

const REGION_CLAIM = `${AUTH0_CLAIM_NAMESPACE}region`;

export class FrontAuth implements AuthService {
  private auth0: Auth0Client;

  constructor() {
    this.auth0 = new Auth0Client({
      domain: AUTH0_CLIENT_DOMAIN,
      clientId: AUTH0_CLIENT_ID,
    });
  }

  async getAccessToken(): Promise<string | null> {
    let tokens = await getStoredTokens(new FrontStorageService());
    // TODO: Refresh token logic should be abstracted to platform.

    // Here, we use spa which means we don't need to bother with refresh tokens and
    // can simply call getTokenSilently.
    if (!tokens || !tokens.accessToken || tokens.expiresAt < Date.now()) {
      const refreshRes = await this.refreshToken(tokens);
      if (refreshRes.isOk()) {
        tokens = refreshRes.value;
      }
    }

    return tokens?.accessToken ?? null;
  }

  async login(isForceLogin?: boolean, forcedConnection?: string) {
    // TODO: Implement force login.
    try {
      await this.auth0.loginWithPopup({
        authorizationParams: {
          scope:
            "offline_access read:user_profile read:conversation create:conversation update:conversation read:agent read:file create:file delete:file",
          audience: DUST_API_AUDIENCE,
          prompt: isForceLogin ? "login" : "none",
          connection: forcedConnection ?? "",
        },
      });
    } catch (error) {
      return new Err(new AuthError("not_authenticated", error?.toString()));
    }

    const authResponse = await this.auth0.getTokenSilently({
      authorizationParams: {
        audience: DUST_API_AUDIENCE,
        scope:
          "offline_access read:user_profile read:conversation create:conversation update:conversation read:agent read:file create:file delete:file",
      },
      detailedResponse: true,
      cacheMode: "off",
    });

    const { access_token: token } = authResponse;

    const claims = jwtDecode<Record<string, string>>(token);
    const dustDomain = getDustDomain(claims);
    const connectionDetails = getConnectionDetails(claims);

    const res = await fetchMe(token, dustDomain);
    if (res.isErr()) {
      return res;
    }

    const tokens = await saveTokens(new FrontStorageService(), {
      accessToken: token,
      refreshToken: "",
      expiresIn: Number.parseInt(claims.exp, 10) * 1000,
    });

    const user = await saveUser(new FrontStorageService(), {
      ...res.value.user,
      ...connectionDetails,
      dustDomain,
      selectedWorkspace:
        res.value.user.workspaces.length === 1
          ? res.value.user.workspaces[0].sId
          : null,
    });

    return new Ok({
      tokens,
      user,
    });
  }

  async logout(): Promise<boolean> {
    await this.auth0.logout();

    // await new FrontStorageService().remove("accessToken");
    // await new FrontStorageService().remove("user");

    return true;
  }

  async refreshToken(
    tokens?: StoredTokens | null
  ): Promise<Result<StoredTokens, AuthError>> {
    throw new Error("Method not implemented.");
  }
}

// TODO: Clean up. Duplicate code from chrome/services/auth.ts.

const REGIONS = ["europe-west1", "us-central1"] as const;
export type RegionType = (typeof REGIONS)[number];

const DOMAIN_FOR_REGION: Record<RegionType, string> = {
  "us-central1": DUST_US_URL,
  "europe-west1": DUST_EU_URL,
};

const CONNECTION_STRATEGY_CLAIM = `${AUTH0_CLAIM_NAMESPACE}connection.strategy`;
const WORKSPACE_ID_CLAIM = `${AUTH0_CLAIM_NAMESPACE}workspaceId`;

const isRegionType = (region: string): region is RegionType =>
  REGIONS.includes(region as RegionType);

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
  console.log("fetchMe", accessToken, dustDomain);
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
