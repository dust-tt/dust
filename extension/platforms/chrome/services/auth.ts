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
import { datadogLogs } from "@datadog/browser-logs";
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

  // Refresh token sends a message to the background script to call the workos refresh token endpoint.
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
      if (!response.success) {
        datadogLogs.logger.error("Refresh token failed", {
          response: response.error,
        });
        return new Err(new AuthError("not_authenticated", response.error));
      }
      if (!response?.accessToken) {
        datadogLogs.logger.error("Refresh failed: No access token received");

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

  // Login sends a message to the background script to call the workos login endpoint.
  // It saves the tokens in the extension and schedules a token refresh.
  // Then it calls the /me route to get the user info.
  async login({ forcedConnection }: { forcedConnection?: string }) {
    try {
      const response = await sendAuthMessage(forcedConnection);
      if (!response.success) {
        log(`Authentication error: ${response.error}`);
        throw new Error(response.error);
      }
      if (!response.accessToken) {
        datadogLogs.logger.error("Login failed: No access token received");
        throw new Error("No access token received.");
      }
      const tokens = await this.saveTokens(response);

      const claims = jwtDecode<Record<string, string>>(tokens.accessToken);

      const dustDomain = getDustDomain(claims);
      const connectionDetails = getConnectionDetails(claims);

      if (
        response.authentication_method === "SSO" &&
        !connectionDetails.connectionStrategy
      ) {
        connectionDetails.connectionStrategy = response.authentication_method;
      }

      const res = await this.fetchMe({
        accessToken: tokens.accessToken,
        dustDomain,
      });
      if (res.isErr()) {
        return res;
      }
      const workspaces = res.value.user.workspaces;

      const selectedWorkspace =
        workspaces.find((w) => w.sId === res.value.user.selectedWorkspace) ||
        workspaces[0];

      const user = await this.saveUser({
        ...res.value.user,
        ...connectionDetails,
        dustDomain,
        selectedWorkspace: selectedWorkspace?.sId ?? null,
      });
      datadogLogs.setUser({
        id: user.sId,
      });
      if (workspaces.length === 1) {
        datadogLogs.setGlobalContext({ workspaceId: workspaces[0].sId });
      }
      return new Ok({ tokens, user });
    } catch (error) {
      return new Err(new AuthError("not_authenticated", error?.toString()));
    }
  }

  // Logout sends a message to the background script to call the workos logout endpoint.
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
      datadogLogs.clearUser();
      datadogLogs.setGlobalContext({});
      await this.storage.clear();
    }
  }

  async getAccessToken(forceRefresh?: boolean): Promise<string | null> {
    let tokens = await this.getStoredTokens();
    if (
      !tokens ||
      !tokens.accessToken ||
      tokens.expiresAt < Date.now() ||
      forceRefresh
    ) {
      const refreshRes = await this.refreshToken(tokens);
      if (refreshRes.isOk()) {
        tokens = refreshRes.value;
      } else {
        tokens = null;
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

    if (result) {
      datadogLogs.setUser({
        id: result.sId,
      });
      if (result.selectedWorkspace) {
        datadogLogs.setGlobalContext({ workspaceId: result.selectedWorkspace });
      }
    }

    return result ?? null;
  }
}
