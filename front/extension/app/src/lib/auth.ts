import {
  sendAuthMessage,
  sendRefreshTokenMessage,
  sentLogoutMessage,
} from "@app/extension/app/src/lib/messages";
import type {
  StoredTokens,
  StoredUser,
} from "@app/extension/app/src/lib/storage";
import {
  clearStoredData,
  getStoredTokens,
  saveTokens,
  saveUser,
} from "@app/extension/app/src/lib/storage";
import type { UserTypeWithWorkspaces } from "@dust-tt/types";

const log = console.error;

// Login sends a message to the background script to call the auth0 login endpoint.
// It saves the tokens in the extension and schedules a token refresh.
// Then it calls the /me route to get the user info.
export const login = async (): Promise<
  { tokens: StoredTokens; user: StoredUser } | undefined
> => {
  try {
    const response = await sendAuthMessage();
    if (!response.accessToken) {
      throw new Error("No access token received.");
    }
    const tokens = await saveTokens(response);
    const me = await fetchMe(tokens.accessToken);
    if (!me) {
      throw new Error("Login failed: No user profile received.");
    }
    const user = await saveUser(me);
    return { tokens, user };
  } catch (error) {
    log("Login failed:", error);
  }
};

// Logout sends a message to the background script to call the auth0 logout endpoint.
// It also clears the stored tokens in the extension.
export const logout = async (): Promise<boolean> => {
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
    await clearStoredData();
  }
};

// Refresh token sends a message to the background script to call the auth0 refresh token endpoint.
// It updates the stored tokens with the new access token.
// If the refresh token is invalid, it will call handleLogout.
export const refreshToken = async (): Promise<StoredTokens | undefined> => {
  try {
    const tokens = await getStoredTokens();
    if (!tokens) {
      throw new Error("No tokens found.");
    }
    const response = await sendRefreshTokenMessage(tokens.refreshToken);
    if (!response?.accessToken) {
      throw new Error("No access token received.");
    }
    return await saveTokens(response);
  } catch (error) {
    log("Refresh token: unknown error.", error);
    await logout();
  }
};

// Fetch me sends a request to the /me route to get the user info.
const fetchMe = async (token: string): Promise<UserTypeWithWorkspaces> => {
  const response = await fetch(`${process.env.DUST_DOMAIN}/api/v1/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch /me: ${response.status} ${response.statusText}`
    );
  }
  const me = await response.json();
  return me.user;
};
