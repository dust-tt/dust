import type {
  AuthService,
  OAuthAuthorizeResponse,
} from "@extension/shared/services/auth";
import type { CaptureOptions } from "@extension/shared/services/capture";

export type AuthBackgroundResponseError = {
  success: false;
  error: string;
};

export type AuthBackgroundResponseSuccess = {
  success: true;
};

export type AuthBackgroundMessage = {
  type: "AUTHENTICATE" | "REFRESH_TOKEN" | "LOGOUT" | "SIGN_CONNECT";
  connection?: string;
  refreshToken?: string;
};

export type GetActiveTabBackgroundMessage = {
  type: "GET_ACTIVE_TAB";
} & CaptureOptions;

export type GetActiveTabBackgroundResponse = {
  title: string;
  url: string;
  content?: string;
  captures?: string[];
  error?: string;
};

export type InputBarStatusMessage = {
  type: "INPUT_BAR_STATUS";
  available: boolean;
};

export type CaptureMesssage = {
  type: "CAPTURE";
};

export type CaptureResponse = {
  dataURI: string;
};

export type AttachSelectionMessage = {
  type: "EXT_ATTACH_TAB";
} & CaptureOptions;

export type RouteChangeMesssage = {
  type: "EXT_ROUTE_CHANGE";
  pathname: string;
  search: string;
};

export type CaptureFullPageMessage = {
  type: "PAGE_CAPTURE_FULL_PAGE";
};

const sendMessage = <T, U>(message: T): Promise<U> => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: U | undefined) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      if (!response) {
        return reject(new Error("No response received."));
      }
      return resolve(response);
    });
  });
};

/**
 * Messages to the background script to authenticate, refresh tokens, and logout.
 */

export const sendAuthMessage = (
  connection?: string
): Promise<OAuthAuthorizeResponse | AuthBackgroundResponseError> => {
  return new Promise((resolve, reject) => {
    const message: AuthBackgroundMessage = {
      type: "AUTHENTICATE",
      connection,
    };
    chrome.runtime.sendMessage(
      message,
      (
        response:
          | OAuthAuthorizeResponse
          | AuthBackgroundResponseError
          | undefined
      ) => {
        const error = chrome.runtime.lastError;
        if (error) {
          if (error.message?.includes("Could not establish connection")) {
            // Attempt to wake up the service worker
            chrome.runtime.getBackgroundPage(() => {
              chrome.runtime.sendMessage(
                message,
                (response: OAuthAuthorizeResponse | undefined) => {
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
  authService: AuthService,
  refreshToken: string
): Promise<OAuthAuthorizeResponse | AuthBackgroundResponseError> => {
  return new Promise((resolve, reject) => {
    const message: AuthBackgroundMessage = {
      type: "REFRESH_TOKEN",
      refreshToken,
    };
    chrome.runtime.sendMessage(
      message,
      (response: OAuthAuthorizeResponse | undefined) => {
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
        void authService.saveTokens(response);
        return resolve(response);
      }
    );
  });
};

export const sentLogoutMessage = (): Promise<
  AuthBackgroundResponseSuccess | AuthBackgroundResponseError
> => {
  return sendMessage<
    AuthBackgroundMessage,
    AuthBackgroundResponseSuccess | AuthBackgroundResponseError
  >({
    type: "LOGOUT",
  });
};

/**
 * Message to the background script to get the active tab content.
 */

export const sendGetActiveTabMessage = (params: CaptureOptions) => {
  return sendMessage<
    GetActiveTabBackgroundMessage,
    GetActiveTabBackgroundResponse
  >({
    type: "GET_ACTIVE_TAB",
    ...params,
  });
};

// Messages from background script to content script

export const sendAttachSelection = (
  opts: CaptureOptions = { includeContent: true, includeCapture: false }
) => {
  return sendMessage<AttachSelectionMessage, void>({
    type: "EXT_ATTACH_TAB",
    ...opts,
  });
};
