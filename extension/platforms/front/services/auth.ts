import {
  AUTH0_CLIENT_DOMAIN,
  AUTH0_CLIENT_ID,
  DUST_API_AUDIENCE,
  FRONT_EXTENSION_URL,
} from "@app/shared/lib/config";
import type { StoredTokens, StoredUser } from "@app/shared/services/auth";
import {
  AuthError,
  AuthService,
  getConnectionDetails,
  getDustDomain,
} from "@app/shared/services/auth";
import type { StorageService } from "@app/shared/services/storage";
import { Auth0Client } from "@auth0/auth0-spa-js";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { jwtDecode } from "jwt-decode";

const API_SCOPES =
  "offline_access read:user_profile read:conversation create:conversation update:conversation read:agent read:file create:file delete:file";

export class FrontAuthService extends AuthService {
  private auth0: Auth0Client;

  constructor(storage: StorageService) {
    super(storage);

    this.auth0 = new Auth0Client({
      domain: AUTH0_CLIENT_DOMAIN,
      clientId: AUTH0_CLIENT_ID,
    });
  }

  // We store the basic user information with list of workspaces and currently selected
  // workspace in Chrome storage.
  async saveUser(user: StoredUser) {
    await this.storage.set("user", user);

    return user;
  }

  private async getAndSaveTokens(): Promise<Result<StoredTokens, AuthError>> {
    try {
      const authResponse = await this.auth0.getTokenSilently({
        authorizationParams: {
          audience: DUST_API_AUDIENCE,
          scope: API_SCOPES,
        },
        detailedResponse: true,
        cacheMode: "off",
      });

      const { access_token: token } = authResponse;
      const claims = jwtDecode<Record<string, string>>(token);

      const tokens = await this.saveTokens({
        accessToken: token,
        refreshToken: "",
        expiresIn: Number.parseInt(claims.exp, 10) * 1000,
      });

      return new Ok(tokens);
    } catch (error) {
      return new Err(new AuthError("not_authenticated", error?.toString()));
    }
  }

  async login({
    isForceLogin,
    forcedConnection,
  }: {
    isForceLogin?: boolean;
    forcedConnection?: string;
  }) {
    try {
      await this.auth0.loginWithPopup({
        authorizationParams: {
          scope: API_SCOPES,
          audience: DUST_API_AUDIENCE,
          prompt: isForceLogin ? "login" : "none",
          connection: forcedConnection ?? "",
        },
      });
    } catch (error) {
      return new Err(new AuthError("not_authenticated", error?.toString()));
    }

    const tokensResult = await this.getAndSaveTokens();
    if (tokensResult.isErr()) {
      return tokensResult;
    }
    const tokens = tokensResult.value;

    const claims = jwtDecode<Record<string, string>>(tokens.accessToken);
    const dustDomain = getDustDomain(claims);
    const connectionDetails = getConnectionDetails(claims);

    const res = await this.fetchMe({
      accessToken: tokens.accessToken,
      dustDomain,
    });
    if (res.isErr()) {
      return res;
    }

    const workspaces = res.value.user.workspaces;
    const user = await this.saveUser({
      ...res.value.user,
      ...connectionDetails,
      dustDomain,
      selectedWorkspace: workspaces.length === 1 ? workspaces[0].sId : null,
    });

    return new Ok({ tokens, user });
  }

  async logout(): Promise<boolean> {
    await this.auth0.logout({
      logoutParams: {
        returnTo: FRONT_EXTENSION_URL,
      },
    });

    await this.storage.clear();

    return true;
  }

  async getAccessToken(): Promise<string | null> {
    let tokens = await this.getStoredTokens();
    if (!tokens || !tokens.accessToken || tokens.expiresAt < Date.now()) {
      const refreshRes = await this.refreshToken();
      if (refreshRes.isOk()) {
        tokens = refreshRes.value;
      }
    }

    return tokens?.accessToken ?? null;
  }

  async refreshToken(): Promise<Result<StoredTokens, AuthError>> {
    return this.getAndSaveTokens();
  }
}
