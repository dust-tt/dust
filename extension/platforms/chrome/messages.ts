import type {
  AuthService,
  OAuthAuthorizeResponse,
} from "@extension/shared/services/auth";
import type {
  CaptureOptions,
  FileData,
} from "@extension/shared/services/capture";

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
  organizationId?: string;
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
  fileData?: FileData;
  error?: string;
};

export type TabInfo = {
  tabId: number;
  title: string;
  url: string;
  active: boolean;
};

export type TabActionMessage =
  | { type: "LIST_TABS" }
  | { type: "ACTIVATE_TAB"; tabId: number }
  | { type: "CLOSE_TAB"; tabId: number }
  | { type: "OPEN_TAB"; url: string }
  | { type: "MOVE_TAB"; tabId: number; index: number }
  | { type: "RELOAD_TAB"; tabId: number };

export type TabActionResponse = {
  success: boolean;
  error?: string;
  tabId?: number;
  tabs?: TabInfo[];
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

export type GetPageElementsMessage = { type: "GET_ELEMENTS"; tabId: number };
export type GetPageElementsResponse = { elements: string; error?: string };

export type ClickPageElementMessage = {
  type: "CLICK_ELEMENT";
  tabId: number;
  elementId: string;
};
export type ClickPageElementResponse = { success: boolean; error?: string };

export type TypeTextMessage = {
  type: "TYPE_TEXT";
  tabId: number;
  elementId: string;
  text: string;
  variant: "replace" | "append";
};

export type TypeTextResponse = { success: boolean; error?: string };

export type DeleteTextMessage = {
  type: "DELETE_TEXT";
  tabId: number;
  elementId: string;
};

export type DeleteTextResponse = { success: boolean; error?: string };

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
  connection?: string,
  organizationId?: string
): Promise<OAuthAuthorizeResponse | AuthBackgroundResponseError> => {
  return new Promise((resolve, reject) => {
    const message: AuthBackgroundMessage = {
      type: "AUTHENTICATE",
      connection,
      organizationId,
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

export const sendListTabsMessage = () => {
  return sendMessage<TabActionMessage, TabActionResponse>({
    type: "LIST_TABS",
  });
};

export const sendTabActionMessage = (message: TabActionMessage) => {
  return sendMessage<TabActionMessage, TabActionResponse>(message);
};

export function sendInteractWithPageMessage(input: {
  action: "get_elements";
  tabId: number;
}): Promise<GetPageElementsResponse>;

export function sendInteractWithPageMessage(input: {
  action: "click_element";
  tabId: number;
  elementId: string;
}): Promise<ClickPageElementResponse>;

export function sendInteractWithPageMessage(input: {
  action: "type_text";
  tabId: number;
  elementId: string;
  text: string;
  variant: "replace" | "append";
}): Promise<TypeTextResponse>;

export function sendInteractWithPageMessage(input: {
  action: "delete_text";
  tabId: number;
  elementId: string;
}): Promise<DeleteTextResponse>;

export function sendInteractWithPageMessage(
  input:
    | { action: "get_elements"; tabId: number }
    | { action: "click_element"; tabId: number; elementId: string }
    | {
        action: "type_text";
        tabId: number;
        elementId: string;
        text: string;
        variant: "replace" | "append";
      }
    | {
        action: "delete_text";
        tabId: number;
        elementId: string;
      }
): Promise<
  | GetPageElementsResponse
  | ClickPageElementResponse
  | TypeTextResponse
  | DeleteTextResponse
> {
  switch (input.action) {
    case "get_elements":
      return sendMessage<GetPageElementsMessage, GetPageElementsResponse>({
        type: "GET_ELEMENTS",
        tabId: input.tabId,
      });
    case "click_element":
      return sendMessage<ClickPageElementMessage, ClickPageElementResponse>({
        type: "CLICK_ELEMENT",
        elementId: input.elementId,
        tabId: input.tabId,
      });
    case "type_text":
      return sendMessage<TypeTextMessage, TypeTextResponse>({
        type: "TYPE_TEXT",
        tabId: input.tabId,
        elementId: input.elementId,
        text: input.text,
        variant: input.variant,
      });
    case "delete_text":
      return sendMessage<DeleteTextMessage, DeleteTextResponse>({
        type: "DELETE_TEXT",
        tabId: input.tabId,
        elementId: input.elementId,
      });
  }
}

// Messages from background script to content script

export const sendAttachSelection = (
  opts: CaptureOptions = { includeContent: true, includeCapture: false }
) => {
  return sendMessage<AttachSelectionMessage, void>({
    type: "EXT_ATTACH_TAB",
    ...opts,
  });
};
