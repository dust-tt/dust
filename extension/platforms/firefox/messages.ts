import type {
  AuthService,
  OAuthAuthorizeResponse,
} from "@app/shared/services/auth";
import type { CaptureOptions } from "@app/shared/services/capture";
import browser from "webextension-polyfill";

export type AuthBackgroundResponse = {
  success: boolean;
};

export type AuthBackgroundMessage = {
  type: "AUTHENTICATE" | "REFRESH_TOKEN" | "LOGOUT" | "SIGN_CONNECT";
  isForceLogin?: boolean;
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
  return browser.runtime.sendMessage(message).then((response: U | undefined) => {
    if (!response) {
      throw new Error("No response received.");
    }
    return response;
  });
};

/**
 * Messages to the background script to authenticate, refresh tokens, and logout.
 */

export const sendAuthMessage = (
  isForceLogin?: boolean,
  connection?: string
): Promise<OAuthAuthorizeResponse> => {
  const message: AuthBackgroundMessage = {
    type: "AUTHENTICATE",
    isForceLogin,
    connection,
  };
  return browser.runtime.sendMessage(message).then((response: OAuthAuthorizeResponse | undefined) => {
    if (!response) {
      throw new Error("No response received.");
    }
    return response;
  });
};

export const sendRefreshTokenMessage = (
  authService: AuthService,
  refreshToken: string
): Promise<OAuthAuthorizeResponse> => {
  const message: AuthBackgroundMessage = {
    type: "REFRESH_TOKEN",
    refreshToken,
  };
  return browser.runtime.sendMessage(message).then((response: OAuthAuthorizeResponse | undefined) => {
    if (!response) {
      throw new Error("No response received.");
    }
    if (
      !response.accessToken ||
      !response.refreshToken ||
      !response.expiresIn
    ) {
      throw new Error("Invalid response received.");
    }
    void authService.saveTokens(response);
    return response;
  });
};

export const sentLogoutMessage = (): Promise<AuthBackgroundResponse> => {
  return sendMessage<AuthBackgroundMessage, AuthBackgroundResponse>({
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
