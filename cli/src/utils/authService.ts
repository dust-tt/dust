import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { JwtPayload } from "jwt-decode";
import { jwtDecode } from "jwt-decode";
import fetch from "node-fetch";

import { resetDustClient } from "./dustClient.js";
import { normalizeError } from "./errors.js";
import TokenStorage from "./tokenStorage.js";

interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Service for managing authentication and token refresh
 */
export const AuthService = {
  /**
   * Refreshes the access token using the stored refresh token
   */
  async refreshTokens(): Promise<Result<boolean, Error>> {
    const refreshToken = await TokenStorage.getRefreshToken();
    if (!refreshToken) {
      return new Err(new Error("No refresh token found"));
    }

    const workOSDomain = process.env.WORKOS_DOMAIN || "";
    const clientId = process.env.WORKOS_CLIENT_ID || "";

    const response = await fetch(
      `https://${workOSDomain}/user_management/authenticate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: refreshToken,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        await TokenStorage.clearTokens();
        resetDustClient();
      }
      return new Err(new Error("Failed to refresh tokens"));
    }

    const data = (await response.json()) as RefreshTokenResponse;
    await TokenStorage.saveTokens(data.access_token, data.refresh_token);

    resetDustClient();

    return new Ok(true);
  },

  /**
   * Gets a valid access token, refreshing if needed
   */
  async getValidAccessToken(): Promise<Result<string | null, Error>> {
    const accessToken = await TokenStorage.getAccessToken();

    if (accessToken?.startsWith("sk-")) {
      return new Ok(accessToken);
    }

    const isValid = await TokenStorage.hasValidAccessToken();

    if (isValid.isErr()) {
      return isValid;
    }

    if (!isValid.value || !accessToken) {
      const refreshed = await this.refreshTokens();
      if (refreshed.isErr()) {
        return new Err(new Error("Failed to refresh tokens"));
      }

      return new Ok(await TokenStorage.getAccessToken());
    }

    // Even if the token appears valid, refresh it if it's close to expiring
    // This is more aggressive but prevents 401s during long-running streams
    let decoded: JwtPayload;
    try {
      decoded = jwtDecode(accessToken);
    } catch (error) {
      // If we can't decode the token, try to refresh
      const refreshed = await this.refreshTokens();
      if (refreshed.isOk()) {
        return new Ok(await TokenStorage.getAccessToken());
      }
      return new Err(normalizeError(error));
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = (decoded.exp ?? 0) - currentTime;

    if (timeUntilExpiry < 30) {
      const refreshed = await this.refreshTokens();
      if (refreshed.isOk()) {
        return new Ok(await TokenStorage.getAccessToken());
      }
      return refreshed;
    }

    return new Ok(accessToken);
  },

  /**
   * Checks if the user is authenticated with valid tokens
   */
  async isAuthenticated(): Promise<boolean> {
    const hasValidAccessToken = await TokenStorage.hasValidAccessToken();
    if (hasValidAccessToken.isErr()) {
      return false;
    }

    if (hasValidAccessToken.value) {
      return true;
    }

    const refreshed = await this.refreshTokens();
    if (refreshed.isOk()) {
      return true;
    }
    return false;
  },

  /**
   * Logs out by clearing all tokens
   */
  async logout(): Promise<void> {
    await TokenStorage.clearTokens();
    // Reset the API client since we've logged out
    resetDustClient();
  },

  /**
   * Gets the selected workspace sId
   */
  async getSelectedWorkspaceId(): Promise<string | null> {
    return TokenStorage.getWorkspaceId();
  },

  /**
   * Gets a fresh access token by always refreshing
   * Use this for long-running requests like streaming
   */
  async getFreshAccessToken(): Promise<string | null> {
    const accessToken = await TokenStorage.getAccessToken();

    // Handle API keys (they don't expire)
    if (accessToken?.startsWith("sk-")) {
      return accessToken;
    }

    // Always refresh the token to ensure it's as fresh as possible
    const refreshed = await this.refreshTokens();
    if (!refreshed) {
      return null;
    }

    // Return the newly refreshed token
    return TokenStorage.getAccessToken();
  },
};

export default AuthService;
