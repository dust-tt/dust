import type {
  AuthBackgroundMessage,
  AuthBackgroundResponse,
  CaptureMesssage,
  CaptureResponse,
  GetActiveTabBackgroundMessage,
  GetActiveTabBackgroundResponse,
  InputBarStatusMessage,
} from "@app/platforms/chrome/messages";
import type { PendingUpdate } from "@app/platforms/chrome/services/core_platform";
import { ChromeCorePlatformService } from "@app/platforms/chrome/services/core_platform";
import {
  AUTH0_CLIENT_DOMAIN,
  AUTH0_CLIENT_ID,
  DUST_API_AUDIENCE,
} from "@app/shared/lib/config";
import { extractPage } from "@app/shared/lib/extraction";
import { generatePKCE } from "@app/shared/lib/utils";
import type { Auth0AuthorizeResponse } from "@app/shared/services/auth";

const log = console.error;

// Initialize the platform service.
const platform = new ChromeCorePlatformService();

const state: {
  refreshingToken: boolean;
  refreshRequests: ((
    auth: Auth0AuthorizeResponse | AuthBackgroundResponse
  ) => void)[];
  lastHandler: (() => void) | undefined;
} = {
  refreshingToken: false,
  refreshRequests: [],
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

  await platform.savePendingUpdate(pendingUpdate);
});

/**
 * Listener to open/close the side panel when the user clicks on the extension icon.
 */
chrome.runtime.onInstalled.addListener(() => {
  void platform.storage.set("extensionReady", false);
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
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

/**
 * Util & listeners to disable context menu items based on the domain.
 */
const shouldDisableContextMenuForDomain = async (
  url: string
): Promise<boolean> => {
  if (url.startsWith("chrome://")) {
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
      chrome.contextMenus.update(menuId, { enabled: !isDisabled });
    }
  );
};

// Add URL change listener to update context menu state.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    const isDisabled = await shouldDisableContextMenuForDomain(tab.url);
    toggleContextMenus(isDisabled);
  }
});

// Also add URL change listener for active tab changes.
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url) {
    const isDisabled = await shouldDisableContextMenuForDomain(tab.url);
    toggleContextMenus(isDisabled);
  }
});

chrome.runtime.onConnect.addListener((port) => {
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
});

const getActionHandler = (menuItemId: string | number) => {
  switch (menuItemId) {
    /**
     * We have the logic to add an action that will open a convo and pre-post a message.
     * We're not using it anymore at the moment but keeping ref here for future iteration
     * if we want to experiment again with quick actions.
     *
     * const params = JSON.stringify({
     *    includeContent: true,
     *    includeCapture: false,
     *    text: ":mention[dust]{sId=dust} summarize this page.",
     *    configurationId: "dust",
     *  });
     *  void chrome.runtime.sendMessage({
     *    type: "EXT_ROUTE_CHANGE",
     *    pathname: "/run",
     *    search: `?${params}`,
     *  });
     *
     */
    case "add_tab_content":
      return () => {
        void chrome.runtime.sendMessage({
          type: "EXT_ATTACH_TAB",
          includeContent: true,
          includeCapture: false,
        });
      };
    case "add_tab_screenshot":
      return () => {
        void chrome.runtime.sendMessage({
          type: "EXT_ATTACH_TAB",
          includeContent: false,
          includeCapture: true,
        });
      };
    case "add_selection":
      return () => {
        void chrome.runtime.sendMessage({
          type: "EXT_ATTACH_TAB",
          includeContent: true,
          includeCapture: false,
          includeSelectionOnly: true,
        });
      };
  }
};

chrome.contextMenus.onClicked.addListener(async (event, tab) => {
  const handler = getActionHandler(event.menuItemId);
  if (!handler) {
    return;
  }

  const isExtensionReady =
    await platform.storage.get<boolean>("extensionReady");

  if (!isExtensionReady && tab) {
    // Store the handler for later use when the extension is ready.
    state.lastHandler = handler;
    void chrome.sidePanel.open({
      windowId: tab.windowId,
    });
  } else {
    void handler();
  }
});

function capture(sendResponse: (x: CaptureResponse) => void) {
  return chrome.tabs.captureVisibleTab(function (dataURI) {
    if (dataURI) {
      sendResponse({ dataURI });
    }
  });
}

/**
 * Listener for messages sent from the react app to the background script.
 * For now we use messages to authenticate the user.
 */
chrome.runtime.onMessage.addListener(
  (
    message:
      | AuthBackgroundMessage
      | GetActiveTabBackgroundMessage
      | CaptureMesssage
      | InputBarStatusMessage,
    sender,
    sendResponse: (
      response:
        | Auth0AuthorizeResponse
        | AuthBackgroundResponse
        | CaptureResponse
        | GetActiveTabBackgroundResponse
    ) => void
  ) => {
    switch (message.type) {
      case "AUTHENTICATE":
        void authenticate(message, sendResponse);
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

      case "CAPTURE":
        capture(sendResponse);
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

            try {
              const includeContent = message.includeContent ?? true;
              const includeCapture = message.includeCapture ?? false;
              const [mimetypeExecution] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => document.contentType,
              });

              let captures: string[] | undefined;
              if (includeCapture) {
                if (mimetypeExecution.result === "text/html") {
                  // Full page capture
                  await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["page.js"],
                  });
                  captures = await new Promise((resolve, reject) => {
                    if (tab?.id) {
                      const timeout = setTimeout(() => {
                        console.error("Timeout waiting for full page capture");
                        reject(
                          new Error("Timeout waiting for full page screenshot.")
                        );
                      }, 10000);
                      chrome.tabs.sendMessage(
                        tab.id,
                        { type: "PAGE_CAPTURE_FULL_PAGE" },
                        (res) => {
                          clearTimeout(timeout);
                          resolve(res);
                        }
                      );
                    } else {
                      console.error("No tab id");
                      reject(new Error("No tab selected."));
                    }
                  });
                } else {
                  captures = [
                    await new Promise<string>((resolve, reject) => {
                      const timeout = setTimeout(() => {
                        console.error("Timeout waiting for capture");
                        reject(
                          new Error("Timeout waiting for page screenshot")
                        );
                      }, 2000);
                      chrome.tabs.captureVisibleTab((res) => {
                        clearTimeout(timeout);
                        resolve(res);
                      });
                    }),
                  ];
                }
                if (!captures || captures.length === 0) {
                  console.error("Empty captures array");
                  throw new Error("Failed to get a screenshot of the page.");
                }
              }
              let content: string | undefined;
              if (includeContent) {
                if (message.includeSelectionOnly) {
                  const [execution] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => window.getSelection()?.toString(),
                  });
                  content = execution?.result ?? "no content.";
                } else {
                  // TODO - handle non-HTML content. For now we just extract the page content.
                  const [execution] = await chrome.scripting.executeScript({
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
          }
        );
        return true;

      case "INPUT_BAR_STATUS":
        // Enable or disable the context menu items based on the input bar status. Actions are only available when the input bar is visible.
        if (state.lastHandler && message.available) {
          state.lastHandler();
          state.lastHandler = undefined;
        }
        return false;

      default:
        log(`Unknown message: ${message}.`);
    }
  }
);

/**
 * Listener for messages sent from external websites that are whitelisted on the manifest.
 * It allows to open the side panel and navigate to a specific conversation.
 *
 * We return true to keep the message channel open for async response.
 */
chrome.runtime.onMessageExternal.addListener((request) => {
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

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      void chrome.sidePanel
        .open({
          windowId: tabs[0].windowId,
        })
        .then(() => {
          chrome.storage.local.get(
            ["extensionReady", "user"],
            ({ extensionReady, user }) => {
              if (request.workspaceId != user?.selectedWorkspace) {
                log("[onMessageExternal] User selected another workspace.");
                return;
              }

              const sendMessage = () => {
                const params = JSON.stringify({
                  conversationId: request.conversationId,
                });
                void chrome.runtime.sendMessage({
                  type: "EXT_ROUTE_CHANGE",
                  pathname: "/run",
                  search: `?${params}`,
                });
              };

              if (!extensionReady) {
                let retries = 0;
                const MAX_RETRIES = 15;
                const RETRY_INTERVAL = 500; // Check every 500ms 15 times = 7.5s total.

                const checkReady = () => {
                  if (retries >= MAX_RETRIES) {
                    log(
                      "[onMessageExternal] Max retries reached waiting for extension ready."
                    );
                    return;
                  }

                  chrome.storage.local.get(
                    ["extensionReady"],
                    ({ extensionReady }) => {
                      if (chrome.runtime.lastError) {
                        log(
                          "[onMessageExternal] Error checking extension ready:",
                          chrome.runtime.lastError
                        );
                        return;
                      }

                      if (extensionReady) {
                        sendMessage();
                      } else {
                        retries++;
                        setTimeout(checkReady, RETRY_INTERVAL);
                      }
                    }
                  );
                };
                checkReady();
              } else {
                sendMessage();
              }
            }
          );
        })
        .catch((err) => {
          log("[onMessageExternal] Error opening side panel:", err);
        });
    }
  });

  return true;
});

/**
 * Authenticate the user using Auth0.
 */
const authenticate = async (
  { isForceLogin, connection }: AuthBackgroundMessage,
  sendResponse: (auth: Auth0AuthorizeResponse | AuthBackgroundResponse) => void
) => {
  // First we call /authorize endpoint to get the authorization code (PKCE flow).
  const redirectUrl = chrome.identity.getRedirectURL();
  const { codeVerifier, codeChallenge } = await generatePKCE();
  const options = {
    client_id: AUTH0_CLIENT_ID,
    response_type: "code",
    scope:
      "offline_access read:user_profile read:conversation create:conversation update:conversation read:agent read:file create:file delete:file",
    redirect_uri: redirectUrl,
    audience: DUST_API_AUDIENCE,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    prompt: isForceLogin ? "login" : "",
    connection: connection ?? "",
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
  state.refreshRequests.push(sendResponse);
  if (!state.refreshingToken) {
    state.refreshingToken = true;
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
      const handlers = state.refreshRequests;
      state.refreshRequests = [];
      handlers.forEach((sendResponse) => {
        sendResponse({
          accessToken: data.access_token,
          refreshToken: data.refresh_token || refreshToken,
          expiresIn: data.expires_in,
        });
      });
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
