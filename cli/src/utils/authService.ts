import fetch from "node-fetch";
import TokenStorage from "./tokenStorage.js";
import { resetDustClient } from "./dustClient.js";

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
    const refreshToken = await TokenStorage.getRefreshToken();
    if (!refreshToken) {
      throw new Error("No refresh token available.");
    }

    const auth0Domain = process.env.AUTH0_CLIENT_DOMAIN || "";
    const clientId = process.env.AUTH0_CLIENT_ID || "";

    const response = await fetch(`https://${auth0Domain}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();

      if (response.status === 400 || response.status === 401) {
        await TokenStorage.clearTokens();
        resetDustClient();
      }

      throw new Error(`Token refresh failed: ${errorData}`);
    }

    const data = (await response.json()) as RefreshTokenResponse;

    // Store the new tokens
    await TokenStorage.saveTokens(data.access_token, data.refresh_token);

    // Reset the API client to use the new tokens
    resetDustClient();

    return true;
  },

  /**
   * Gets a valid access token, refreshing if needed
   */
  async getValidAccessToken(): Promise<string | null> {
    const isValid = await TokenStorage.hasValidAccessToken();

    if (!isValid) {
      const refreshed = await this.refreshTokens();
      if (!refreshed) {
        return null;
      }
    }

    return await TokenStorage.getAccessToken();
  },

  /**
   * Checks if the user is authenticated with valid tokens
   */
  async isAuthenticated(): Promise<boolean> {
    return (
      (await TokenStorage.hasValidAccessToken()) || (await this.refreshTokens())
    );
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
};

export default AuthService;
