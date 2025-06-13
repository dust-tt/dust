import browser from "webextension-polyfill";
import type {
  AuthBackgroundMessage,
  AuthBackgroundResponse,
  CaptureMesssage,
  CaptureResponse,
  GetActiveTabBackgroundMessage,
  GetActiveTabBackgroundResponse,
  InputBarStatusMessage,
} from "@app/platforms/firefox/messages";
import type { PendingUpdate } from "@app/platforms/firefox/services/core_platform";
import { FirefoxCorePlatformService } from "@app/platforms/firefox/services/core_platform";
import {
  AUTH0_CLIENT_ID,
  DEFAULT_DUST_API_DOMAIN,
  DUST_API_AUDIENCE,
  getAuthorizeURL,
  getLogoutURL,
  getOAuthClientID,
  getTokenURL,
} from "@app/shared/lib/config";
import { extractPage } from "@app/shared/lib/extraction";
import { generatePKCE } from "@app/shared/lib/utils";
import type { OAuthAuthorizeResponse } from "@app/shared/services/auth";
import { jwtDecode } from "jwt-decode";

const log = console.error;
const DEFAULT_TOKEN_EXPIRY_IN_SECONDS = 3600; // 1 hour.

// Initialize the platform service.
const platform = new FirefoxCorePlatformService();

const state: {
  refreshingToken: boolean;
  refreshRequests: ((
    auth: OAuthAuthorizeResponse | AuthBackgroundResponse
  ) => void)[];
  lastHandler: (() => void) | undefined;
  authPlatform: "auth0" | "workos";
} = {
  refreshingToken: false,
  refreshRequests: [],
  lastHandler: undefined,
  authPlatform: "workos",
};

/**
 * Fetch the auth platform from the API
 */
const fetchAuthPlatform = async () => {
  try {
    const response = await fetch(`${DEFAULT_DUST_API_DOMAIN}/api/v1/auth`);
    if (!response.ok) {
      throw new Error("Failed to fetch auth platform");
    }
    const data = await response.json();
    state.authPlatform = data.auth;
  } catch (error) {
    log("Error fetching auth platform:", error);
    state.authPlatform = "auth0"; // Default to auth0 if there's an error
  }
};

/**
 * Listener for force update mechanism.
 */
browser.runtime.onUpdateAvailable.addListener(async (details) => {
  const pendingUpdate: PendingUpdate = {
    version: details.version,
    detectedAt: Date.now(),
  };
  await platform.savePendingUpdate(pendingUpdate);
});

/**
 * Listener to open/close the side panel when the user clicks on the extension icon.
 * (Sidebar panel is set in manifest, not at runtime in Firefox)
 */
browser.runtime.onInstalled.addListener(() => {
  void platform.storage.set("extensionReady", false);
  browser.contextMenus.create({
    id: "add_tab_content",
    title: "Add tab content to conversation",
    contexts: ["all"],
  });
  browser.contextMenus.create({
    id: "add_tab_screenshot",
    title: "Add tab screenshot to conversation",
    contexts: ["all"],
  });
  browser.contextMenus.create({
    id: "add_selection",
    title: "Add selection to conversation",
    contexts: ["selection"],
  });
});

const shouldDisableContextMenuForDomain = async (
  url: string
): Promise<boolean> => {
  if (url.startsWith("firefox://")) {
    return true;
  }
  const user = await platform.auth.getStoredUser();
  if (!user || !user.selectedWorkspace) {
    return false;
  }
  const blacklistedDomains =
    user.workspaces.find((w) => w.sId === user.selectedWorkspace)
      ?.blacklistedDomains || [];
  return blacklistedDomains.some((d) => url.includes(d));
};

const toggleContextMenus = (isDisabled: boolean) => {
  ["add_tab_content", "add_tab_screenshot", "add_selection"].forEach(
    (menuId) => {
      browser.contextMenus.update(menuId, { enabled: !isDisabled });
    }
  );
};

// Add URL change listener to update context menu state.
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    const isDisabled = await shouldDisableContextMenuForDomain(tab.url);
    toggleContextMenus(isDisabled);
  }
});

// Also add URL change listener for active tab changes.
browser.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await browser.tabs.get(activeInfo.tabId);
  if (tab.url) {
    const isDisabled = await shouldDisableContextMenuForDomain(tab.url);
    toggleContextMenus(isDisabled);
  }
});

browser.runtime.onConnect.addListener(async (port) => {
  if (port.name === "sidepanel-connection") {
    console.log("Sidepanel is there");
    void platform.storage.set("extensionReady", true);
    port.onDisconnect.addListener(async () => {
      // This fires when sidepanel closes
      console.log("Sidepanel was closed");
      await platform.storage.set("extensionReady", false);
      state.lastHandler = undefined;
    });
  }
  // Fetch and store the auth platform
  void fetchAuthPlatform();
});

const getActionHandler = (menuItemId: string | number) => {
  switch (menuItemId) {
    case "add_tab_content":
      return () => {
        void browser.runtime.sendMessage({
          type: "EXT_ATTACH_TAB",
          includeContent: true,
          includeCapture: false,
        });
      };
    case "add_tab_screenshot":
      return () => {
        void browser.runtime.sendMessage({
          type: "EXT_ATTACH_TAB",
          includeContent: false,
          includeCapture: true,
        });
      };
    case "add_selection":
      return () => {
        void browser.runtime.sendMessage({
          type: "EXT_ATTACH_TAB",
          includeContent: true,
          includeCapture: false,
          includeSelectionOnly: true,
        });
      };
  }
};

browser.contextMenus.onClicked.addListener(async (event, tab) => {
  const handler = getActionHandler(event.menuItemId);
  if (!handler) return;
  const isExtensionReady =
    await platform.storage.get<boolean>("extensionReady");
  if (!isExtensionReady && tab) {
    state.lastHandler = handler;
    void browser.sidebarAction.open();
  } else {
    void handler();
  }
});

function capture(sendResponse: (x: CaptureResponse) => void) {
  browser.tabs.captureVisibleTab().then((dataURI) => {
    if (dataURI) {
      sendResponse({ dataURI });
      return dataURI;
    }
  });
}

browser.runtime.onMessage.addListener(
  async (
    message:
      | AuthBackgroundMessage
      | GetActiveTabBackgroundMessage
      | CaptureMesssage
      | InputBarStatusMessage,
    sender,
    sendResponse: (
      response:
        | OAuthAuthorizeResponse
        | AuthBackgroundResponse
        | CaptureResponse
        | GetActiveTabBackgroundResponse
    ) => void
  ) => {
    switch (message.type) {
      case "AUTHENTICATE":
        const r = await authenticate(
          message as AuthBackgroundMessage,
          sendResponse
        );
        return r;
      case "REFRESH_TOKEN":
        if (!(message as any).refreshToken) {
          log("No refresh token provided on REFRESH_TOKEN message.");
          sendResponse({ success: false });
          return true;
        }
        const res = await refreshToken(
          (message as any).refreshToken,
          sendResponse
        );
        console.log(res);
        return res;
      case "LOGOUT":
        await logout(sendResponse);
        return true;
      case "SIGN_CONNECT":
        return true;
      case "CAPTURE":
        const rc = capture(sendResponse);
        return rc;
      case "GET_ACTIVE_TAB": {
        const tabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        const tab = tabs[0];
        if (!tab?.id) {
          log("No active tab found.");
          sendResponse({ url: "", content: "", title: "" });
          return true;
        }
        try {
          const includeContent = (message as any).includeContent ?? true;
          const includeCapture = (message as any).includeCapture ?? false;
          const [mimetypeExecution] = await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.contentType,
          });
          let captures: string[] | undefined;
          if (includeCapture) {
            if (mimetypeExecution.result === "text/html") {
              await browser.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["page.js"],
              });
              captures = [
                await browser.tabs.sendMessage(tab.id, {
                  type: "PAGE_CAPTURE_FULL_PAGE",
                }),
              ];
            } else {
              captures = [await browser.tabs.captureVisibleTab()];
            }
            if (!captures || captures.length === 0) {
              throw new Error("Failed to get a screenshot of the page.");
            }
          }
          let content: string | undefined;
          if (includeContent) {
            if ((message as any).includeSelectionOnly) {
              const [execution] = await browser.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => window.getSelection()?.toString(),
              });
              content = execution?.result ?? "no content.";
            } else {
              const [execution] = await browser.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractPage(tab.url || ""),
              });
              content = execution?.result ?? "no content.";
            }
          }
          sendResponse({
            title: tab.title || "",
            url: tab.url || "",
            content,
            captures,
          });
          return {
            title: tab.title || "",
            url: tab.url || "",
            content,
            captures,
          };
        } catch (error) {
          log("Error getting active tab content:", error);
          sendResponse({
            url: tab.url || "",
            content: "",
            title: "",
            error:
              error instanceof Error
                ? error.message
                : "Failed to get content from the current tab.",
          });
        }
        return true;
      }
      case "INPUT_BAR_STATUS":
        if (state.lastHandler && (message as any).available) {
          state.lastHandler();
          state.lastHandler = undefined;
        }
        return;
      default:
        log(`Unknown message: ${JSON.stringify(message)}`);
        return;
    }
  }
);

browser.runtime.onMessageExternal.addListener(async (request) => {
  if (
    request.action !== "openSidePanel" ||
    !request.conversationId ||
    !request.workspaceId ||
    !/^[a-zA-Z0-9_-]{10,}$/.test(request.conversationId) ||
    !/^[a-zA-Z0-9_-]{10,}$/.test(request.workspaceId)
  ) {
    log("[onMessageExternal] Invalid params:", request);
    return true;
  }
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    try {
      await browser.sidebarAction.open();
      const { extensionReady, user } = await browser.storage.local.get([
        "extensionReady",
        "user",
      ]);
      if (request.workspaceId != user?.selectedWorkspace) {
        log("[onMessageExternal] User selected another workspace.");
        return true;
      }
      const sendMessage = () => {
        const params = JSON.stringify({
          conversationId: request.conversationId,
        });
        void browser.runtime.sendMessage({
          type: "EXT_ROUTE_CHANGE",
          pathname: "/run",
          search: `?${params}`,
        });
      };
      if (!extensionReady) {
        let retries = 0;
        const MAX_RETRIES = 15;
        const RETRY_INTERVAL = 500;
        const checkReady = async () => {
          if (retries >= MAX_RETRIES) {
            log(
              "[onMessageExternal] Max retries reached waiting for extension ready."
            );
            return;
          }
          const { extensionReady } = await browser.storage.local.get([
            "extensionReady",
          ]);
          if (extensionReady) {
            sendMessage();
          } else {
            retries++;
            setTimeout(checkReady, RETRY_INTERVAL);
          }
          return;
        };
        checkReady();
      } else {
        sendMessage();
      }
    } catch (err) {
      log("[onMessageExternal] Error opening sidebar:", err);
    }
  }
  return true;
});

const authenticate = async (
  { isForceLogin, connection }: AuthBackgroundMessage,
  sendResponse: (auth: OAuthAuthorizeResponse | AuthBackgroundResponse) => void
) => {
  const redirectUrl = browser.identity.getRedirectURL();
  const { codeVerifier, codeChallenge } = await generatePKCE();
  const options: Record<string, string> = {
    client_id: getOAuthClientID(state.authPlatform),
    response_type: "code",
    redirect_uri: redirectUrl,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  };
  if (state.authPlatform === "auth0") {
    options.audience = DUST_API_AUDIENCE;
    options.scope =
      "offline_access read:user_profile read:conversation create:conversation update:conversation read:agent read:file create:file delete:file";
    options.prompt = isForceLogin ? "login" : "";
  } else if (state.authPlatform === "workos") {
    options.scope = "openid profile email";
    if (connection) {
      options.organization_id = connection;
    }
    options.provider = "authkit";
  }
  const queryString = new URLSearchParams(options).toString();
  const authUrl = getAuthorizeURL({ auth: state.authPlatform, queryString });

  try {
    const redirectUrlResult = await browser.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });
    if (!redirectUrlResult || redirectUrlResult.includes("error")) {
      log(`launchWebAuthFlow error in redirect URL: ${redirectUrlResult}`);
      sendResponse({ success: false });
      return;
    }
    const url = new URL(redirectUrlResult);
    const queryParams = new URLSearchParams(url.search);
    const authorizationCode = queryParams.get("code");
    const error = queryParams.get("error");
    if (error) {
      log(`Authentication error: ${error}`);
      sendResponse({ success: false });
      return;
    }
    if (authorizationCode) {
      const data = await exchangeCodeForTokens(authorizationCode, codeVerifier);
      sendResponse(data);
      return data;
    } else {
      log(
        `launchWebAuthFlow missing code in redirect URL: ${redirectUrlResult}`
      );
      sendResponse({ success: false });
    }
  } catch (err) {
    log(`launchWebAuthFlow error: ${err}`);
    sendResponse({ success: false });
  }
};

const refreshToken = async (
  refreshToken: string,
  sendResponse: (auth: OAuthAuthorizeResponse | AuthBackgroundResponse) => void
) => {
  state.refreshRequests.push(sendResponse);
  if (!state.refreshingToken) {
    state.refreshingToken = true;
    try {
      const tokenParams: Record<string, string> = {
        grant_type: "refresh_token",
        client_id: getOAuthClientID(state.authPlatform),
        refresh_token: refreshToken,
      };
      const response = await fetch(getTokenURL(state.authPlatform), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(tokenParams),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          `Token refresh failed: ${data.error} - ${data.error_description}`
        );
      }
      const data = await response.json();
      const handlers = state.refreshRequests;
      state.refreshRequests = [];
      handlers.forEach((sendResponse) => {
        sendResponse({
          accessToken: data.access_token,
          refreshToken: data.refresh_token || refreshToken,
          expiresIn: data.expires_in ?? DEFAULT_TOKEN_EXPIRY_IN_SECONDS,
        });
      });
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresIn: data.expires_in ?? DEFAULT_TOKEN_EXPIRY_IN_SECONDS,
      };
    } catch (error) {
      log("Token refresh failed: unknown error", error);
      const handlers = state.refreshRequests;
      state.refreshRequests = [];
      handlers.forEach((sendResponse) => {
        sendResponse({ success: false });
      });
    } finally {
      state.refreshingToken = false;
    }
  }
};

const exchangeCodeForTokens = async (
  code: string,
  codeVerifier: string
): Promise<OAuthAuthorizeResponse | AuthBackgroundResponse> => {
  try {
    const tokenParams: Record<string, string> = {
      grant_type: "authorization_code",
      client_id: getOAuthClientID(state.authPlatform),
      code_verifier: codeVerifier,
      code,
      redirect_uri: browser.identity.getRedirectURL(),
    };
    const tokenURL = getTokenURL(state.authPlatform);
    const response = await fetch(tokenURL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenParams),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(
        `Token exchange failed: ${data.error} - ${data.error_description}`
      );
    }
    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in ?? DEFAULT_TOKEN_EXPIRY_IN_SECONDS,
      ...(data.id_token && { idToken: data.id_token }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    log(`Token exchange failed: ${message}`, error);
    return { success: false };
  }
};

const logout = async (
  sendResponse: (response: AuthBackgroundResponse) => void
) => {
  const redirectUri = browser.identity.getRedirectURL();
  const queryParams: Record<string, string> = {
    returnTo: redirectUri,
  };
  if (state.authPlatform === "auth0") {
    queryParams.client_id = AUTH0_CLIENT_ID;
  } else if (state.authPlatform === "workos") {
    const accessToken = await platform.auth.getAccessToken();
    if (accessToken) {
      const decodedPayload = jwtDecode<Record<string, string>>(accessToken);
      if (decodedPayload) {
        queryParams.session_id = decodedPayload.sid || "";
      }
    } else {
      log("No access token found for WorkOS logout.");
      sendResponse({ success: false });
      return;
    }
  }
  const logoutUrl = getLogoutURL({
    auth: state.authPlatform,
    queryString: new URLSearchParams(queryParams).toString(),
  });
  try {
    await browser.identity.launchWebAuthFlow({
      url: logoutUrl,
      interactive: true,
    });
    sendResponse({ success: true });
  } catch (err) {
    log("Logout failed:", err);
    sendResponse({ success: false });
  }
};
