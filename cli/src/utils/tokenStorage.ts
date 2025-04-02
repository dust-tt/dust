import keytar from "keytar";
import { jwtDecode } from "jwt-decode";

// Constants for storage
const SERVICE_NAME = "dust-cli";
const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const WORKSPACE_KEY = "workspace_sid";

interface JWTPayload {
  exp: number;
  [key: string]: any;
}

/**
 * Utility for securely storing and retrieving authentication tokens
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
  async hasValidAccessToken(): Promise<boolean> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return false;

    const decoded = jwtDecode<JWTPayload>(accessToken);
    const currentTime = Math.floor(Date.now() / 1000);

    return decoded.exp > currentTime;
  },

  /**
   * Saves the selected workspace ID
   */
  async saveWorkspaceId(
    workspaceSid: string,
    workspaceName?: string
  ): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, WORKSPACE_KEY, workspaceSid);
  },

  /**
   * Retrieves the selected workspace ID
   */
  async getWorkspaceId(): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, WORKSPACE_KEY);
  },

  /**
   * Clears all stored tokens and workspace
   */
  async clearTokens(): Promise<void> {
    await keytar.deletePassword(SERVICE_NAME, ACCESS_TOKEN_KEY);
    await keytar.deletePassword(SERVICE_NAME, REFRESH_TOKEN_KEY);
    await keytar.deletePassword(SERVICE_NAME, WORKSPACE_KEY);
  },
};

export default TokenStorage;
