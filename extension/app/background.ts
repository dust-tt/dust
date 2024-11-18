import type { PendingUpdate } from "@extension/lib/storage";
import { savePendingUpdate } from "@extension/lib/storage";

import {
  AUTH0_AUDIENCE,
  AUTH0_CLIENT_DOMAIN,
  AUTH0_CLIENT_ID,
} from "./src/lib/config";
import { extractPage } from "./src/lib/extraction";
import type {
  Auth0AuthorizeResponse,
  AuthBackgroundMessage,
  AuthBackgroundResponse,
  GetActiveTabBackgroundMessage,
  GetActiveTabBackgroundResponse,
  InputBarStatusMessage,
} from "./src/lib/messages";
import { generatePKCE } from "./src/lib/utils";

const log = console.error;

const state: {
  port: chrome.runtime.Port | undefined;
  extensionReady: boolean;
  inputBarReady: boolean;
  lastHandler: (() => void) | undefined;
} = {
  port: undefined,
  extensionReady: false,
  inputBarReady: false,
  lastHandler: undefined,
};

/**
 * Listener for force update mechanism.
 */
chrome.runtime.onUpdateAvailable.addListener(async (details) => {
  const pendingUpdate: PendingUpdate = {
    version: details.version,
    detectedAt: Date.now(),
  };
  await savePendingUpdate(pendingUpdate);
});

/**
 * Listener to open/close the side panel when the user clicks on the extension icon.
 */
chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.create({
    id: "ask_dust",
    title: "Ask @dust to summarize this page",
    contexts: ["all"],
  });
  chrome.contextMenus.create({
    id: "add_tab_content",
    title: "Add tab content to conversation",
    contexts: ["all"],
  });
  chrome.contextMenus.create({
    id: "add_tab_screenshot",
    title: "Add tab screenshot to conversation",
    contexts: ["all"],
  });

  chrome.contextMenus.create({
    id: "add_selection",
    title: "Add selection to conversation",
    contexts: ["selection"],
  });
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "sidepanel-connection") {
    console.log("Sidepanel is there");
    state.port = port;
    state.extensionReady = true;
    port.onDisconnect.addListener(() => {
      // This fires when sidepanel closes
      console.log("Sidepanel was closed");
      state.port = undefined;
      state.extensionReady = false;
      state.inputBarReady = false;
      state.lastHandler = undefined;
    });
  }
});

const getActionHandler = (menuItemId: string | number) => {
  switch (menuItemId) {
    case "ask_dust":
      return () => {
        if (state.port) {
          const params = JSON.stringify({
            includeContent: true,
            includeScreenshot: false,
            text: ":mention[dust]{sId=dust} summarize this page.",
            configurationId: "dust",
          });
          state.port.postMessage({
            type: "ROUTE_CHANGE",
            pathname: "/run",
            search: `?${params}`,
          });
        }
      };
    case "add_tab_content":
      return () => {
        if (state.port) {
          state.port.postMessage({
            type: "ATTACH_TAB",
            includeContent: true,
            includeScreenshot: false,
          });
        }
      };
    case "add_tab_screenshot":
      return () => {
        if (state.port) {
          state.port.postMessage({
            type: "ATTACH_TAB",
            includeContent: false,
            includeScreenshot: true,
          });
        }
      };
    case "add_selection":
      return () => {
        if (state.port) {
          state.port.postMessage({
            type: "ATTACH_TAB",
            includeContent: true,
            includeScreenshot: false,
            includeSelectionOnly: true,
          });
        }
      };
  }
};

chrome.contextMenus.onClicked.addListener(async (event, tab) => {
  const handler = getActionHandler(event.menuItemId);
  if (!handler) {
    return;
  }

  if (!state.extensionReady && tab) {
    // Store the handler for later use when the extension is ready.
    state.lastHandler = handler;
    void chrome.sidePanel.open({
      windowId: tab.windowId,
    });
  } else {
    await handler();
  }
});

/**
 * Listener for messages sent from the react app to the background script.
 * For now we use messages to authenticate the user.
 */
chrome.runtime.onMessage.addListener(
  (
    message:
      | AuthBackgroundMessage
      | GetActiveTabBackgroundMessage
      | InputBarStatusMessage,
    sender,
    sendResponse: (
      response:
        | Auth0AuthorizeResponse
        | AuthBackgroundResponse
        | GetActiveTabBackgroundResponse
    ) => void
  ) => {
    switch (message.type) {
      case "AUTHENTICATE":
        void authenticate(sendResponse);
        return true; // Keep the message channel open for async response.

      case "REFRESH_TOKEN":
        if (!message.refreshToken) {
          log("No refresh token provided on REFRESH_TOKEN message.");
          sendResponse({ success: false });
          return true;
        }
        void refreshToken(message.refreshToken, sendResponse);
        return true;

      case "LOGOUT":
        logout(sendResponse);
        return true; // Keep the message channel open.

      case "SIGN_CONNECT":
        return true;

      case "GET_ACTIVE_TAB":
        chrome.tabs.query(
          { active: true, currentWindow: true },
          async (tabs) => {
            const tab = tabs[0];
            if (!tab?.id) {
              log("No active tab found.");
              sendResponse({ url: "", content: "", title: "" });
              return;
            }

            const includeContent = message.includeContent ?? true;
            const includeScreenshot = message.includeScreenshot ?? false;
            try {
              const capture = includeScreenshot
                ? await chrome.tabs.captureVisibleTab()
                : undefined;

              const [result] = includeContent
                ? await chrome.scripting.executeScript(
                    message.includeSelectionOnly
                      ? {
                          target: { tabId: tab.id },
                          func: () => window.getSelection()?.toString(),
                        }
                      : {
                          target: { tabId: tab.id },
                          func: extractPage(tab.url || ""),
                        }
                  )
                : [undefined];
              sendResponse({
                title: tab.title || "",
                url: tab.url || "",
                content: includeContent
                  ? (result?.result ?? "no content.")
                  : undefined,
                screenshot: capture,
              });
            } catch (error) {
              log("Error getting active tab content:", error);
              sendResponse({ url: tab.url || "", content: "", title: "" });
            }
          }
        );
        return true;
      case "INPUT_BAR_STATUS":
        // Enable or disable the context menu items based on the input bar status. Actions are only available when the input bar is visible.
        state.inputBarReady = message.available;
        if (state.lastHandler && state.inputBarReady) {
          state.lastHandler();
          state.lastHandler = undefined;
        }
        return true;
      default:
        log(`Unknown message: ${message}.`);
    }
  }
);

/**
 * Authenticate the user using Auth0.
 */
const authenticate = async (
  sendResponse: (auth: Auth0AuthorizeResponse | AuthBackgroundResponse) => void
) => {
  // First we call /authorize endpoint to get the authorization code (PKCE flow).
  const redirectUrl = chrome.identity.getRedirectURL();
  const { codeVerifier, codeChallenge } = await generatePKCE();
  const options = {
    client_id: AUTH0_CLIENT_ID,
    response_type: "code",
    // "offline_access" to receive refresh tokens to maintain user sessions without re-prompting for authentication.
    scope: "openid offline_access",
    redirect_uri: redirectUrl,
    audience: AUTH0_AUDIENCE,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  };

  const queryString = new URLSearchParams(options).toString();
  const authUrl = `https://${AUTH0_CLIENT_DOMAIN}/authorize?${queryString}`;

  chrome.identity.launchWebAuthFlow(
    { url: authUrl, interactive: true },
    async (redirectUrl) => {
      if (chrome.runtime.lastError) {
        log(`launchWebAuthFlow error: ${chrome.runtime.lastError.message}`);
        sendResponse({ success: false });
        return;
      }
      if (!redirectUrl || redirectUrl.includes("error")) {
        log(`launchWebAuthFlow error in redirect URL: ${redirectUrl}`);
        sendResponse({ success: false });
        return;
      }

      const url = new URL(redirectUrl);
      const queryParams = new URLSearchParams(url.search);
      const authorizationCode = queryParams.get("code");

      if (authorizationCode) {
        // Once we have the code we call /token endpoint to exchange it for tokens.
        const data = await exchangeCodeForTokens(
          authorizationCode,
          codeVerifier
        );
        sendResponse(data);
      } else {
        log(`launchWebAuthFlow missing code in redirect URL: ${redirectUrl}`);
        sendResponse({ success: false });
      }
    }
  );
};

/**
 * Refresh the access token using the refresh token.
 */
const refreshToken = async (
  refreshToken: string,
  sendResponse: (auth: Auth0AuthorizeResponse | AuthBackgroundResponse) => void
) => {
  try {
    const tokenUrl = `https://${AUTH0_CLIENT_DOMAIN}/oauth/token`;
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: AUTH0_CLIENT_ID,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(
        `Token refresh failed: ${data.error} - ${data.error_description}`
      );
    }

    const data = await response.json();
    sendResponse({
      idToken: data.id_token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
    });
  } catch (error) {
    log("Token refresh failed: unknown error", error);
    sendResponse({ success: false });
  }
};

/**
 *  Exchange authorization code for tokens
 */
const exchangeCodeForTokens = async (
  code: string,
  codeVerifier: string
): Promise<Auth0AuthorizeResponse | AuthBackgroundResponse> => {
  try {
    const tokenUrl = `https://${AUTH0_CLIENT_DOMAIN}/oauth/token`;
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: AUTH0_CLIENT_ID,
        code_verifier: codeVerifier,
        code,
        redirect_uri: chrome.identity.getRedirectURL(),
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(
        `Token exchange failed: ${data.error} - ${data.error_description}`
      );
    }

    const data = await response.json();
    return {
      idToken: data.id_token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    log(`Token exchange failed: ${message}`, error);
    return { success: false };
  }
};

/**
 * Logout the user from Auth0.
 */
const logout = (sendResponse: (response: AuthBackgroundResponse) => void) => {
  const redirectUri = chrome.identity.getRedirectURL();
  const logoutUrl = `https://${AUTH0_CLIENT_DOMAIN}/v2/logout?client_id=${AUTH0_CLIENT_ID}&returnTo=${encodeURIComponent(redirectUri)}`;

  chrome.identity.launchWebAuthFlow(
    { url: logoutUrl, interactive: true },
    () => {
      if (chrome.runtime.lastError) {
        log("Logout failed:", chrome.runtime.lastError.message);
        sendResponse({ success: false });
      } else {
        sendResponse({ success: true });
      }
    }
  );
};
