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

export const AuthService = {
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

    let decoded: JwtPayload;
    try {
      decoded = jwtDecode(accessToken);
    } catch (error) {
      const refreshed = await this.refreshTokens();
      if (refreshed.isOk()) {
        return new Ok(await TokenStorage.getAccessToken());
      }
      return new Err(normalizeError(error));
    }

    const currentTimeSeconds = Math.floor(Date.now() / 1000);
    const timeUntilExpirySeconds = (decoded.exp ?? 0) - currentTimeSeconds;

    if (timeUntilExpirySeconds < 30) {
      const refreshed = await this.refreshTokens();
      if (refreshed.isOk()) {
        return new Ok(await TokenStorage.getAccessToken());
      }
      return refreshed;
    }

    return new Ok(accessToken);
  },

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

  async logout(): Promise<void> {
    await TokenStorage.clearTokens();
    resetDustClient();
  },

  async getSelectedWorkspaceId(): Promise<string | null> {
    return TokenStorage.getWorkspaceId();
  },

  async getFreshAccessToken(): Promise<string | null> {
    const accessToken = await TokenStorage.getAccessToken();

    if (accessToken?.startsWith("sk-")) {
      return accessToken;
    }

    const refreshed = await this.refreshTokens();
    if (!refreshed) {
      return null;
    }

    return TokenStorage.getAccessToken();
  },
};

export default AuthService;
