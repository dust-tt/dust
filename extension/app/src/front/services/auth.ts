import { Auth0Client } from "@auth0/auth0-spa-js";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import {
  AUTH0_CLAIM_NAMESPACE,
  DEFAULT_DUST_API_DOMAIN,
  DUST_EU_URL,
  DUST_US_URL,
} from "@extension/lib/config";
import type {
  StoredTokens,
  UserTypeWithExtensionWorkspaces,
} from "@extension/lib/storage";
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
      domain: "your-domain",
      clientId: "your-client-id",
    });
  }

  async getAccessToken(): Promise<string | null> {
    throw new Error("Method not implemented.");
  }

  async login(isForceLogin?: boolean, forcedConnection?: string) {
    // TODO: Implement force login.
    try {
      await this.auth0.loginWithPopup();
    } catch (error) {
      return new Err(new AuthError("not_authenticated", error?.toString()));
    }

    const token = await this.auth0.getTokenSilently();
    const claims = jwtDecode<Record<string, string>>(token);
    const dustDomain = getDustDomain(claims);
    const connectionDetails = getConnectionDetails(claims);

    const res = await fetchMe(token, dustDomain);
    if (res.isErr()) {
      return res;
    }

    // TODO:
    return new Ok({
      tokens: {
        accessToken: token,
        refreshToken: "refreshToken",
        expiresAt: Date.now() + 1000 * 60 * 60 * 24,
      },
      user: {
        ...res.value.user,
        ...connectionDetails,
        dustDomain,
        selectedWorkspace:
          res.value.user.workspaces.length === 1
            ? res.value.user.workspaces[0].sId
            : null,
      },
    });
  }

  logout(): Promise<boolean> {
    throw new Error("Method not implemented.");
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
