import type {
  AuthBackgroundMessage,
  AuthBackgroundResponseError,
  AuthBackgroundResponseSuccess,
  CaptureMesssage,
  CaptureResponse,
  GetActiveTabBackgroundMessage,
  GetActiveTabBackgroundResponse,
  InputBarStatusMessage,
} from "@app/platforms/chrome/messages";
import type { PendingUpdate } from "@app/platforms/chrome/services/core_platform";
import { ChromeCorePlatformService } from "@app/platforms/chrome/services/core_platform";
import { DUST_US_URL } from "@app/shared/lib/config";
import { extractPage } from "@app/shared/lib/extraction";
import { generatePKCE } from "@app/shared/lib/utils";
import type { OAuthAuthorizeResponse } from "@app/shared/services/auth";
import { jwtDecode } from "jwt-decode";

const log = console.error;
const DEFAULT_TOKEN_EXPIRY_IN_SECONDS = 5 * 60; // 5 minutes.

// Initialize the platform service.
const platform = new ChromeCorePlatformService();

const state: {
  refreshingToken: boolean;
  refreshRequests: ((
    auth: OAuthAuthorizeResponse | AuthBackgroundResponseError
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

chrome.runtime.onConnect.addListener(async (port) => {
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
      | InputBarStatusMessage
      | { type: "LOG"; data: Record<string, unknown> },
    sender,
    sendResponse: (
      response:
        | OAuthAuthorizeResponse
        | AuthBackgroundResponseSuccess
        | AuthBackgroundResponseError
        | CaptureResponse
        | GetActiveTabBackgroundResponse
    ) => void
  ) => {
    switch (message.type) {
      case "LOG":
        switch (message.data.type) {
          case "info":
            console.log("[DEBUG] Info:", JSON.stringify(message.data, null, 2));
            break;
          case "error":
            console.error(
              "[DEBUG] Error:",
              JSON.stringify(message.data, null, 2)
            );
            break;
          default:
            console.log("[DEBUG]:", JSON.stringify(message.data, null, 2));
            break;
        }
        return false;
      case "AUTHENTICATE":
        void authenticate(message, sendResponse);
        return true; // Keep the message channel open for async response.

      case "REFRESH_TOKEN":
        if (!message.refreshToken) {
          log("No refresh token provided on REFRESH_TOKEN message.");
          sendResponse({
            success: false,
            error: "No refresh token provided on REFRESH_TOKEN message.",
          });
          return true;
        }
        void refreshToken(message.refreshToken, sendResponse);
        return true;
      case "LOGOUT":
        void logout(sendResponse);
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
        log(`Unknown message: ${JSON.stringify(message, null, 2)}.`);
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
 * Authenticate the user using WorkOS.
 */
const authenticate = async (
  { connection }: AuthBackgroundMessage,
  sendResponse: (
    auth: OAuthAuthorizeResponse | AuthBackgroundResponseError
  ) => void
) => {
  // First we call /authorize endpoint to get the authorization code (PKCE flow).
  const redirectUrl = chrome.identity.getRedirectURL();
  const { codeVerifier, codeChallenge } = await generatePKCE();

  const options: Record<string, string> = {
    response_type: "code",
    redirect_uri: redirectUrl,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    organization_id: connection ?? "",
    provider: "authkit",
  };

  const queryString = new URLSearchParams(options).toString();

  const authUrl = `${DUST_US_URL}/api/v1/auth/authorize?${queryString}`;

  chrome.identity.launchWebAuthFlow(
    { url: authUrl, interactive: true },
    async (redirectUrl) => {
      if (chrome.runtime.lastError) {
        log(`WebAuthFlow error: ${chrome.runtime.lastError.message}`);
        sendResponse({
          success: false,
          error: `WebAuthFlow error: ${chrome.runtime.lastError.message}`,
        });
        return;
      }
      if (!redirectUrl || redirectUrl.includes("error")) {
        log(`Error in redirect URL: ${redirectUrl}`);
        sendResponse({
          success: false,
          error: `Error in redirect URL: ${redirectUrl}`,
        });
        return;
      }

      const url = new URL(redirectUrl);
      const queryParams = new URLSearchParams(url.search);
      const authorizationCode = queryParams.get("code");

      const error = queryParams.get("error");

      if (error) {
        log(`Authentication error: ${error}`);
        sendResponse({
          success: false,
          error: `Authentication error: ${error}`,
        });
        return;
      }

      if (authorizationCode) {
        const data = await exchangeCodeForTokens(
          authorizationCode,
          codeVerifier
        );
        sendResponse(data);
      } else {
        log(`Missing authorization code: ${redirectUrl}`);
        sendResponse({
          success: false,
          error: `Missing authorization code`,
        });
      }
    }
  );
};

/**
 * Refresh the access token using the refresh token.
 */
const refreshToken = async (
  refreshToken: string,
  sendResponse: (
    auth: OAuthAuthorizeResponse | AuthBackgroundResponseError
  ) => void
) => {
  state.refreshRequests.push(sendResponse);
  if (!state.refreshingToken) {
    state.refreshingToken = true;
    try {
      const tokenParams: Record<string, string> = {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      };

      const user = await platform.auth.getStoredUser();
      if (!user) {
        log("No user found for token refresh.");
        const handlers = state.refreshRequests;
        state.refreshRequests = [];
        handlers.forEach((sendResponse) => {
          sendResponse({
            success: false,
            error: "No user found for token refresh.",
          });
        });
        return;
      }

      const response = await fetch(
        `${user.dustDomain}/api/v1/auth/authenticate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(tokenParams),
        }
      );

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
          success: true,
          accessToken: data.access_token,
          refreshToken: data.refresh_token || refreshToken,
          expiresIn: data.expires_in ?? DEFAULT_TOKEN_EXPIRY_IN_SECONDS,
          authentication_method: data.authentication_method,
        });
      });
    } catch (error) {
      log("Token refresh failed: unknown error", error);
      const handlers = state.refreshRequests;
      state.refreshRequests = [];
      handlers.forEach((sendResponse) => {
        sendResponse({
          success: false,
          error: `Token refresh failed: ${error}`,
        });
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
): Promise<OAuthAuthorizeResponse | AuthBackgroundResponseError> => {
  try {
    const tokenParams: Record<string, string> = {
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
      code,
      redirect_uri: chrome.identity.getRedirectURL(),
    };

    const response = await fetch(`${DUST_US_URL}/api/v1/auth/authenticate`, {
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
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in ?? DEFAULT_TOKEN_EXPIRY_IN_SECONDS,
      ...(data.id_token && { idToken: data.id_token }),
      authentication_method: data.authentication_method,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    log(`Token exchange failed: ${message}`, error);
    return { success: false, error: `Token exchange failed: ${message}` };
  }
};

/**
 * Logout the user.
 */
const logout = async (
  sendResponse: (
    response: AuthBackgroundResponseSuccess | AuthBackgroundResponseError
  ) => void
) => {
  const redirectUri = chrome.identity.getRedirectURL();
  const queryParams: Record<string, string> = {
    returnTo: redirectUri,
  };
  // We need to get the session to log out the user from WorkOS.
  const accessToken = await platform.auth.getAccessToken();
  if (accessToken) {
    const decodedPayload = jwtDecode<Record<string, string>>(accessToken);
    if (decodedPayload) {
      queryParams.session_id = decodedPayload.sid || "";
    }
  } else {
    log("No access token found for WorkOS logout.");
    sendResponse({ success: false, error: "No access token found." });
    return;
  }

  const user = await platform.auth.getStoredUser();
  if (!user) {
    return true;
  }

  const logoutUrl = `${user.dustDomain}/api/v1/auth/logout?${new URLSearchParams(
    queryParams
  )}`;

  chrome.identity.launchWebAuthFlow(
    { url: logoutUrl, interactive: false },
    () => {
      if (chrome.runtime.lastError) {
        log("Logout failed:", chrome.runtime.lastError.message);
        sendResponse({
          success: false,
          error: `Logout failed: ${chrome.runtime.lastError.message}`,
        });
      } else {
        sendResponse({ success: true });
      }
    }
  );
};
