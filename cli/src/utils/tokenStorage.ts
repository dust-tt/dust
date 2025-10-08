import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { jwtDecode } from "jwt-decode";
import keytar from "keytar";

import { normalizeError } from "./errors.js";

// Constants for storage
const SERVICE_NAME = "dust-cli";
const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const WORKSPACE_KEY = "workspace_sid";
const REGION_KEY = "region";

interface JWTPayload {
  exp: number;
  [key: string]: any;
}

/**
 * Utility for securely storing and retrieving authentication tokens and user info
 */
export const TokenStorage = {
  /**
   * Saves all tokens securely to the system keychain
   */
  async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, ACCESS_TOKEN_KEY, accessToken);
    await keytar.setPassword(SERVICE_NAME, REFRESH_TOKEN_KEY, refreshToken);
  },

  /**
   * Retrieves the access token from secure storage
   */
  async getAccessToken(): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, ACCESS_TOKEN_KEY);
  },

  /**
   * Retrieves the refresh token from secure storage
   */
  async getRefreshToken(): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, REFRESH_TOKEN_KEY);
  },

  /**
   * Checks if an access token exists and is not expired
   */
  async hasValidAccessToken(): Promise<Result<boolean, Error>> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      return new Err(new Error("No access token found"));
    }

    // API keys don't expire
    if (accessToken.startsWith("sk-")) {
      return new Ok(true);
    }

    let decoded: JWTPayload;
    try {
      decoded = jwtDecode<JWTPayload>(accessToken);
    } catch (error) {
      return new Err(normalizeError(error));
    }

    const currentTime = Math.floor(Date.now() / 1000);
    return new Ok(decoded.exp > currentTime);
  },

  /**
   * Saves the selected workspace ID
   */
  async saveWorkspaceId(workspaceSid: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, WORKSPACE_KEY, workspaceSid);
  },

  /**
   * Retrieves the selected workspace ID
   */
  async getWorkspaceId(): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, WORKSPACE_KEY);
  },

  /**
   * Saves the user's region
   */
  async saveRegion(region: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, REGION_KEY, region);
  },

  /**
   * Retrieves the user's region
   */
  async getRegion(): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, REGION_KEY);
  },

  /**
   * Clears all stored tokens, workspace, and region
   */
  async clearTokens(): Promise<void> {
    await keytar.deletePassword(SERVICE_NAME, ACCESS_TOKEN_KEY);
    await keytar.deletePassword(SERVICE_NAME, REFRESH_TOKEN_KEY);
    await keytar.deletePassword(SERVICE_NAME, WORKSPACE_KEY);
    await keytar.deletePassword(SERVICE_NAME, REGION_KEY);
  },
};

export default TokenStorage;
