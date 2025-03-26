import {
  sendAuthMessage,
  sendRefreshTokenMessage,
  sentLogoutMessage,
} from "@app/platforms/chrome/messages";
import type { StoredTokens, StoredUser } from "@app/shared/services/auth";
import {
  AuthError,
  AuthService,
  getConnectionDetails,
  getDustDomain,
} from "@app/shared/services/auth";
import type { StorageService } from "@app/shared/services/storage";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { jwtDecode } from "jwt-decode";

const log = console.error;

export class ChromeAuthService extends AuthService {
  constructor(storage: StorageService) {
    super(storage);
  }

  // Internal methods.

  // We store the basic user information with list of workspaces and currently selected
  // workspace in Chrome storage.
  async saveUser(user: StoredUser) {
    await this.storage.set("user", user);

    return user;
  }

  // Refresh token sends a message to the background script to call the auth0 refresh token endpoint.
  // It updates the stored tokens with the new access token.
  // If the refresh token is invalid, it will call handleLogout.
  async refreshToken(
    tokens: StoredTokens | null
  ): Promise<Result<StoredTokens, AuthError>> {
    try {
      tokens = tokens ?? (await this.getStoredTokens());
      if (!tokens) {
        return new Err(new AuthError("not_authenticated", "No tokens found."));
      }
      const response = await sendRefreshTokenMessage(this, tokens.refreshToken);
      if (!response?.accessToken) {
        return new Err(
          new AuthError("not_authenticated", "No access token received")
        );
      }

      const storedTokens = await this.saveTokens(response);
      return new Ok(storedTokens);
    } catch (error) {
      log("Refresh token: unknown error.", error);
      return new Err(new AuthError("not_authenticated", error?.toString()));
    }
  }

  // Login sends a message to the background script to call the auth0 login endpoint.
  // It saves the tokens in the extension and schedules a token refresh.
  // Then it calls the /me route to get the user info.
  async login({
    isForceLogin,
    forcedConnection,
  }: {
    isForceLogin?: boolean;
    forcedConnection?: string;
  }) {
    try {
      const response = await sendAuthMessage(isForceLogin, forcedConnection);
      if (!response.accessToken) {
        throw new Error("No access token received.");
      }
      const tokens = await this.saveTokens(response);

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
    } catch (error) {
      return new Err(new AuthError("not_authenticated", error?.toString()));
    }
  }

  // Logout sends a message to the background script to call the auth0 logout endpoint.
  // It also clears the stored tokens in the extension.
  async logout() {
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
      await this.storage.clear();
    }
  }

  async getAccessToken(): Promise<string | null> {
    let tokens = await this.getStoredTokens();
    if (!tokens || !tokens.accessToken || tokens.expiresAt < Date.now()) {
      const refreshRes = await this.refreshToken(tokens);
      if (refreshRes.isOk()) {
        tokens = refreshRes.value;
      }
    }

    return tokens?.accessToken ?? null;
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

  async getStoredUser() {
    const result = await this.storage.get<StoredUser>("user");

    return result ?? null;
  }
}
