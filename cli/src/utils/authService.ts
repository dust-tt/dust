import type {JwtPayload} from "jwt-decode";
import { jwtDecode  } from "jwt-decode";
import fetch from "node-fetch";

import { resetDustClient } from "./dustClient.js";
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
  async refreshTokens(): Promise<boolean> {
    try {
      const refreshToken = await TokenStorage.getRefreshToken();
      if (!refreshToken) {
        return false;
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
        // Clear tokens on authentication errors
        if (response.status === 400 || response.status === 401) {
          await TokenStorage.clearTokens();
          resetDustClient();
        }
        return false;
      }

      const data = (await response.json()) as RefreshTokenResponse;

      // Store the new tokens
      await TokenStorage.saveTokens(data.access_token, data.refresh_token);

      // Reset the API client to use the new tokens
      resetDustClient();

      return true;
    } catch (error) {
      console.error("Token refresh failed:", error);
      return false;
    }
  },

  /**
   * Gets a valid access token, refreshing if needed
   */
  async getValidAccessToken(): Promise<string | null> {
    const accessToken = await TokenStorage.getAccessToken();

    // Handle API keys (they don't expire)
    if (accessToken?.startsWith("sk-")) {
      return accessToken;
    }

    // Check if we have a valid access token
    const isValid = await TokenStorage.hasValidAccessToken();

    if (isValid && accessToken) {
      // Even if the token appears valid, refresh it if it's close to expiring
      // This is more aggressive but prevents 401s during long-running streams
      let decoded: JwtPayload;
      try {
        decoded = jwtDecode(accessToken);
      } catch (_) {
        // If we can't decode the token, try to refresh
        const refreshed = await this.refreshTokens();
        if (refreshed) {
          return TokenStorage.getAccessToken();
        }
        return null;
      }

      const currentTime = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = (decoded.exp ?? 0) - currentTime;

      // If token expires in less than 30 seconds, refresh it proactively
      if (timeUntilExpiry < 30) {
        const refreshed = await this.refreshTokens();
        if (refreshed) {
          return TokenStorage.getAccessToken();
        }
      }

      return accessToken;
    }

    // Try to refresh if token is invalid or missing
    const refreshed = await this.refreshTokens();
    if (!refreshed) {
      return null;
    }

    // Return the newly refreshed token
    return TokenStorage.getAccessToken();
  },

  /**
   * Checks if the user is authenticated with valid tokens
   */
  async isAuthenticated(): Promise<boolean> {
    // First check if we have a valid access token
    if (await TokenStorage.hasValidAccessToken()) {
      return true;
    }

    // If not, try to refresh tokens
    return this.refreshTokens();
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
