import { saveTokens } from "@extension/lib/storage";

export type Auth0AuthorizeResponse = {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
};
export type AuthBackgroundResponse = {
  success: boolean;
};

export type AuthBackroundMessage = {
  type: "AUTHENTICATE" | "REFRESH_TOKEN" | "LOGOUT" | "SIGN_CONNECT";
  refreshToken?: string;
};

export type GetActiveTabBackgroundMessage = {
  type: "GET_ACTIVE_TAB";
  includeContent?: boolean;
  includeScreenshot?: boolean;
};

export type GetActiveTabBackgroundResponse = {
  title: string;
  url: string;
  content?: string;
  screenshot?: string;
};

/**
 * Messages to the background script to authenticate, refresh tokens, and logout.
 */

export const sendAuthMessage = (): Promise<Auth0AuthorizeResponse> => {
  return new Promise((resolve, reject) => {
    const message: AuthBackroundMessage = { type: "AUTHENTICATE" };
    chrome.runtime.sendMessage(
      message,
      (response: Auth0AuthorizeResponse | undefined) => {
        const error = chrome.runtime.lastError;
        if (error) {
          if (error.message?.includes("Could not establish connection")) {
            // Attempt to wake up the service worker
            chrome.runtime.getBackgroundPage(() => {
              chrome.runtime.sendMessage(
                message,
                (response: Auth0AuthorizeResponse | undefined) => {
                  if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                  }
                  if (!response) {
                    return reject(new Error("No response received."));
                  }
                  return resolve(response);
                }
              );
            });
          } else {
            reject(new Error(error.message || "An unknown error occurred."));
          }
        }
        if (!response) {
          return reject(new Error("No response received."));
        }
        return resolve(response);
      }
    );
  });
};

export const sendRefreshTokenMessage = (
  refreshToken: string
): Promise<Auth0AuthorizeResponse> => {
  return new Promise((resolve, reject) => {
    const message: AuthBackroundMessage = {
      type: "REFRESH_TOKEN",
      refreshToken,
    };
    chrome.runtime.sendMessage(
      message,
      (response: Auth0AuthorizeResponse | undefined) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        if (!response) {
          return reject(new Error("No response received."));
        }
        if (
          !response.accessToken ||
          !response.refreshToken ||
          !response.expiresIn
        ) {
          return reject(new Error("Invalid response received."));
        }
        void saveTokens(response);
        return resolve(response);
      }
    );
  });
};

export const sentLogoutMessage = (): Promise<AuthBackgroundResponse> => {
  return new Promise((resolve, reject) => {
    const message: AuthBackroundMessage = { type: "LOGOUT" };
    chrome.runtime.sendMessage(
      message,
      (response: AuthBackgroundResponse | undefined) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        if (!response) {
          return reject(new Error("No response received."));
        }
        return resolve(response);
      }
    );
  });
};

/**
 * Message to the background script to get the active tab content.
 */

export const sendGetActiveTabMessage = (
  includeContent: boolean,
  includeScreenshot: boolean
): Promise<GetActiveTabBackgroundResponse> => {
  return new Promise((resolve, reject) => {
    const message: GetActiveTabBackgroundMessage = {
      type: "GET_ACTIVE_TAB",
      includeContent,
      includeScreenshot,
    };
    chrome.runtime.sendMessage(
      message,
      (response: GetActiveTabBackgroundResponse | undefined) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        if (!response) {
          return reject(new Error("No response received."));
        }
        return resolve(response);
      }
    );
  });
};
