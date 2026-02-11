import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { jwtDecode } from "jwt-decode";

import keytar from "keytar";

import { normalizeError } from "./errors.js";

const SERVICE_NAME = "dust-cli";
const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const WORKSPACE_KEY = "workspace_sid";
const REGION_KEY = "region";

interface JWTPayload {
  exp: number;
  [key: string]: unknown;
}

export const TokenStorage = {
  async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, ACCESS_TOKEN_KEY, accessToken);
    await keytar.setPassword(SERVICE_NAME, REFRESH_TOKEN_KEY, refreshToken);
  },

  async getAccessToken(): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, ACCESS_TOKEN_KEY);
  },

  async getRefreshToken(): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, REFRESH_TOKEN_KEY);
  },

  async hasValidAccessToken(): Promise<Result<boolean, Error>> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      return new Err(new Error("No access token found"));
    }

    if (accessToken.startsWith("sk-")) {
      return new Ok(true);
    }

    let decoded: JWTPayload;
    try {
      decoded = jwtDecode<JWTPayload>(accessToken);
    } catch (error) {
      return new Err(normalizeError(error));
    }

    const currentTimeSeconds = Math.floor(Date.now() / 1000);
    return new Ok(decoded.exp > currentTimeSeconds);
  },

  async saveWorkspaceId(workspaceSid: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, WORKSPACE_KEY, workspaceSid);
  },

  async getWorkspaceId(): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, WORKSPACE_KEY);
  },

  async saveRegion(region: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, REGION_KEY, region);
  },

  async getRegion(): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, REGION_KEY);
  },

  async clearTokens(): Promise<void> {
    await keytar.deletePassword(SERVICE_NAME, ACCESS_TOKEN_KEY);
    await keytar.deletePassword(SERVICE_NAME, REFRESH_TOKEN_KEY);
    await keytar.deletePassword(SERVICE_NAME, WORKSPACE_KEY);
    await keytar.deletePassword(SERVICE_NAME, REGION_KEY);
  },
};

export default TokenStorage;
