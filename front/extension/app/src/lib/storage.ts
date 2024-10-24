import type { Auth0AuthorizeResponse } from "@app/extension/app/src/lib/messages";
import type {
  LightWorkspaceType,
  UserTypeWithWorkspaces,
} from "@dust-tt/types";

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type StoredUser = {
  userId: string;
  email: string;
  username: string;
  fullName: string;
  selectedWorkspace: string | null;
  workspaces: LightWorkspaceType[];
};

/**
 * Tokens.
 * We store the access token, refresh token, and expiration time in Chrome storage.
 */

export const saveTokens = async (
  rawTokens: Auth0AuthorizeResponse
): Promise<StoredTokens> => {
  const tokens: StoredTokens = {
    accessToken: rawTokens.accessToken,
    refreshToken: rawTokens.refreshToken,
    expiresAt: Date.now() + rawTokens.expiresIn * 1000,
  };
  await chrome.storage.local.set(tokens);
  return tokens;
};

export const getStoredTokens = async (): Promise<StoredTokens | null> => {
  const result = await chrome.storage.local.get([
    "accessToken",
    "refreshToken",
    "expiresAt",
  ]);
  if (result.accessToken && result.expiresAt) {
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
    };
  }
  return null;
};

export const getAccessToken = async (): Promise<string | null> => {
  const result = await chrome.storage.local.get(["accessToken"]);
  return result.accessToken ?? null;
};

/**
 * User.
 * We store the basic user information with list of workspaces and currently selected workspace in Chrome storage.
 */

export const saveUser = async (
  user: UserTypeWithWorkspaces
): Promise<StoredUser> => {
  const storedUser: StoredUser = {
    userId: user.sId,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    selectedWorkspace:
      user.workspaces.length === 1 ? user.workspaces[0].sId : null,
    workspaces: user.workspaces,
  };
  await chrome.storage.local.set({ user: storedUser });
  return storedUser;
};

export const saveSelectedWorkspace = async (
  workspaceId: string
): Promise<StoredUser> => {
  const storedUser = await getStoredUser();
  if (!storedUser) {
    throw new Error("No user found.");
  }
  storedUser.selectedWorkspace = workspaceId;
  await chrome.storage.local.set({ user: storedUser });
  return storedUser;
};

export const getStoredUser = async (): Promise<StoredUser | null> => {
  const result = await chrome.storage.local.get(["user"]);
  return result.user ?? null;
};

/**
 * Clear all stored data.
 */

export const clearStoredData = async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(
      ["accessToken", "refreshToken", "expiresAt", "user"],
      () => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        return resolve();
      }
    );
  });
};
