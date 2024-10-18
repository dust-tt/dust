// Auth0 config.
export const AUTH0_CLIENT_DOMAIN = process.env.AUTH0_CLIENT_DOMAIN ?? "";
export const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID ?? "";
export const AUTH0_AUDIENCE = `https://${AUTH0_CLIENT_DOMAIN}/api/v2/`;
export const AUTH0_PROFILE_ROUTE = `https://${AUTH0_CLIENT_DOMAIN}/userinfo`;

export type Auth0AuthorizeResponse = {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type AuthBackgroundResponse = {
  success: boolean;
};

export type AuthBackroundMessage = {
  type: "AUTHENTICATE" | "REFRESH_TOKEN" | "LOGOUT" | "SIGN_CONNECT";
  refreshToken?: string;
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
 * Utils to manage tokens.
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
  if (result.accessToken && result.refreshToken && result.expiresAt) {
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
    };
  }
  return null;
};

export const clearStoredTokens = async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(
      ["accessToken", "refreshToken", "expiresAt"],
      () => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        return resolve();
      }
    );
  });
};
