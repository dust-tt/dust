import type {
  AuthBackgroundMessage,
  AuthBackgroundResponseError,
  AuthBackgroundResponseSuccess,
  CaptureMesssage,
  CaptureResponse,
  GetActiveTabBackgroundMessage,
  GetActiveTabBackgroundResponse,
  InputBarStatusMessage,
} from "@extension/platforms/chrome/messages";
import type { PendingUpdate } from "@extension/platforms/chrome/services/core_platform";
import { ChromeCorePlatformService } from "@extension/platforms/chrome/services/core_platform";
import { DUST_US_URL } from "@extension/shared/lib/config";
import { extractPage } from "@extension/shared/lib/extraction";
import type { OAuthAuthorizeResponse } from "@extension/shared/services/auth";
import { jwtDecode } from "jwt-decode";

const log = console.error;
const DEFAULT_TOKEN_EXPIRY_IN_SECONDS = 5 * 60; // 5 minutes.

// URL prefixes that are restricted for content script injection
const RESTRICTED_URL_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "brave://",
  "opera://",
] as const;

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
 * Helper function to check if the browser supports the Side Panel API.
 */
const isSidePanelSupported = (): boolean => {
  return typeof chrome.sidePanel !== "undefined";
};

// In-memory cache (valid for this service worker's lifetime). Persisted to
// storage so detection survives service worker restarts.
let nativeSidePanelCache: boolean | null = null;

// Tracks whether we are currently inside the first-time native side panel
// probe. While true the persistent onConnect handler must not update
// nativeSidePanelCache, because the probe may be seeing a phantom connection
// from Arc and will set the correct value itself after the probe resolves.
let isProbing = false;

// Keeps a reference to the active native side panel port so we can send a
// close request when the user clicks the toolbar button again. Null when the
// panel is closed (or after a service-worker restart).
let activeSidePanelPort: chrome.runtime.Port | null = null;

/**
 * Opens the native side panel if supported and actually functional.
 *
 * On first call, opens the panel and waits up to 800 ms to see whether the
 * side panel UI connects back via the "sidepanel-connection" port. Arc exposes
 * the chrome.sidePanel API but resolves open() without ever showing a UI, so
 * this probe reliably distinguishes Chrome (connects) from Arc (times out).
 *
 * The result is cached in memory for the lifetime of this service worker
 * instance. The probe runs once per SW start.
 *
 * Returns true if the native side panel was opened, false to fall back to the
 * content script sidebar.
 */
const tryOpenNativeSidePanel = async (windowId: number): Promise<boolean> => {
  if (!isSidePanelSupported()) {
    return false;
  }

  // Use in-memory cache when available (valid for this service worker's
  // lifetime). The probe runs once per SW start; the cost (~800 ms worst-case)
  // is acceptable on the first toolbar click after each SW restart.
  if (nativeSidePanelCache !== null) {
    if (nativeSidePanelCache) {
      void chrome.sidePanel.open({ windowId });
    }
    return nativeSidePanelCache;
  }

  // First-time detection: open the panel and verify the connection persists.
  //
  // Some browsers (e.g. Arc) expose chrome.sidePanel but load the panel
  // invisibly, causing a sidepanel-connection port to fire and then immediately
  // disconnect. A real side panel (Chrome) stays connected for as long as the
  // panel is open. We use a two-phase check:
  //   1. Wait up to 800 ms for a sidepanel-connection port.
  //   2. If one arrives, wait 300 ms to see if it stays connected.
  // Only if both conditions are met do we consider the native panel functional.
  //
  // isProbing prevents the persistent onConnect handler from treating the
  // phantom Arc connection as a real native side panel.
  isProbing = true;
  void chrome.sidePanel.open({ windowId });
  const { connected, port: probePort } = await new Promise<{
    connected: boolean;
    port: chrome.runtime.Port | null;
  }>((resolve) => {
    const timeoutTimer = setTimeout(() => {
      chrome.runtime.onConnect.removeListener(portListener);
      resolve({ connected: false, port: null });
    }, 800);

    const portListener = (port: chrome.runtime.Port) => {
      if (port.name === "sidepanel-connection") {
        clearTimeout(timeoutTimer);
        chrome.runtime.onConnect.removeListener(portListener);

        // Panel connected — check that it stays connected (real UI) vs
        // disconnects immediately (invisible/phantom panel in Arc).
        const persistTimer = setTimeout(() => {
          port.onDisconnect.removeListener(onEarlyDisconnect);
          resolve({ connected: true, port });
        }, 300);

        const onEarlyDisconnect = () => {
          clearTimeout(persistTimer);
          resolve({ connected: false, port: null });
        };
        port.onDisconnect.addListener(onEarlyDisconnect);
      }
    };

    chrome.runtime.onConnect.addListener(portListener);
  });
  isProbing = false;

  // For Chrome (connected = true), track the open port so the action handler
  // can toggle the panel closed later.
  if (connected && probePort) {
    activeSidePanelPort = probePort;
    void platform.storage.set("extensionReady", true);
    probePort.onDisconnect.addListener(async () => {
      activeSidePanelPort = null;
      await platform.storage.set("extensionReady", false);
      state.lastHandler = undefined;
    });
  }

  nativeSidePanelCache = connected;
  return connected;
};

/**
 * Helper function to check if we can inject content script into a URL or open the side panel
 */
const canOpenExtension = (url: string | undefined): boolean => {
  if (!url) {
    return false;
  }

  // Block restricted URLs (browser-specific and extension URLs)
  return !RESTRICTED_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
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
 * Listener to set up context menus when the extension is installed.
 */
// Always keep openPanelOnActionClick false so chrome.action.onClicked fires
// in every browser. We open the side panel (or content script sidebar) manually
// inside that handler, using a try-catch to detect browsers like Arc that expose
// the chrome.sidePanel API but don't implement the native side panel UI.
if (isSidePanelSupported()) {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
}

chrome.runtime.onInstalled.addListener(() => {
  void platform.storage.set("extensionReady", false);
  nativeSidePanelCache = null;
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
 * Inject content script programmatically if not already loaded
 */
const ensureContentScriptLoaded = async (tabId: number): Promise<boolean> => {
  try {
    // Try to send a ping message to check if content script is loaded
    await chrome.tabs.sendMessage(tabId, { action: "ping" });
    return true;
  } catch (_error) {
    // Content script not loaded, inject it now
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content-script.js"],
      });
      // Wait a bit for the script to initialize
      await new Promise((resolve) => setTimeout(resolve, 100));
      return true;
    } catch (injectError) {
      console.error("Failed to inject content script:", injectError);
      return false;
    }
  }
};

/**
 * Listener to toggle the sidebar when the user clicks on the extension icon.
 */
chrome.action.onClicked.addListener(async (tab) => {
  // Fast path for Chrome (native side panel already confirmed): toggle it.
  // If the panel is open, ask it to close itself; otherwise open it.
  if (nativeSidePanelCache === true) {
    if (!tab.id || !canOpenExtension(tab.url)) {
      console.log("Cannot open extension on this tab:", tab.url);
      return;
    }
    if (activeSidePanelPort) {
      activeSidePanelPort.postMessage({ type: "CLOSE_SIDE_PANEL" });
    } else {
      void chrome.sidePanel.open({ windowId: tab.windowId });
    }
    return;
  }

  // For the first click, go through the full detection flow.
  if (await tryOpenNativeSidePanel(tab.windowId)) {
    return;
  }

  if (!tab.id || !canOpenExtension(tab.url)) {
    console.log("Cannot open extension on this tab:", tab.url);
    return;
  }

  const loaded = await ensureContentScriptLoaded(tab.id);
  if (!loaded) {
    console.error("Failed to load content script");
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { action: "toggleSidebar" });
  } catch (error) {
    console.error("Failed to toggle sidebar:", error);
  }
});

/**
 * Util & listeners to disable context menu items based on the domain.
 */
const shouldDisableContextMenuForDomain = async (
  url: string
): Promise<boolean> => {
  // Disable context menu for restricted URLs
  if (RESTRICTED_URL_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    return true;
  }

  const token = await platform.auth.getAccessToken();
  const regionInfo = await platform.auth.getRegionInfoFromStorage();
  const selectedWorkspace = await platform.auth.getSelectedWorkspace();

  if (!token || !regionInfo || !selectedWorkspace) {
    return false;
  }

  try {
    const res = await fetch(
      `${regionInfo.url}/api/w/${selectedWorkspace}/extension/config`,
      {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "omit", // Ensure cookies are not sent with requests from the extension
      }
    );
    if (!res.ok) {
      return false;
    }
    const data = await res.json();
    const blacklistedDomains: string[] = data.blacklistedDomains ?? [];
    return blacklistedDomains.some((d) => url.includes(d));
  } catch {
    return false;
  }
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
    // Skip connections that arrive during the first-time probe — those are
    // handled (and may be phantom Arc connections) by the probe's own listener.
    if (isProbing) {
      return;
    }
    console.log("Sidepanel is there");
    nativeSidePanelCache = true;
    activeSidePanelPort = port;
    void platform.storage.set("extensionReady", true);
    port.onDisconnect.addListener(async () => {
      // This fires when sidepanel closes
      console.log("Sidepanel was closed");
      activeSidePanelPort = null;
      await platform.storage.set("extensionReady", false);
      state.lastHandler = undefined;
    });
  } else if (port.name === "content-script-connection") {
    // Content-script sidebar (Arc and similar browsers). Only manage
    // extensionReady — do NOT touch nativeSidePanelCache.
    void platform.storage.set("extensionReady", true);
    port.onDisconnect.addListener(async () => {
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
    if (await tryOpenNativeSidePanel(tab.windowId)) {
      // Native side panel opened — it will fire INPUT_BAR_STATUS when ready.
    } else if (tab.id && canOpenExtension(tab.url)) {
      // Open the sidebar via content script
      const loaded = await ensureContentScriptLoaded(tab.id);
      if (loaded) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: "openSidebar" });
        } catch (error) {
          console.error("Failed to open sidebar:", error);
        }
      }
    }
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
        | OAuthAuthorizeResponse
        | AuthBackgroundResponseSuccess
        | AuthBackgroundResponseError
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

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    if (!tab) {
      log("[onMessageExternal] No active tab found");
      return;
    }

    const openSidebar = async () => {
      if (await tryOpenNativeSidePanel(tab.windowId)) {
        return;
      }
      if (!tab.id || !canOpenExtension(tab.url)) {
        log("[onMessageExternal] Cannot inject content script in this tab");
        return;
      }
      const loaded = await ensureContentScriptLoaded(tab.id);
      if (!loaded) {
        log("[onMessageExternal] Failed to load content script");
        return;
      }
      await chrome.tabs.sendMessage(tab.id, { action: "openSidebar" });
    };

    try {
      await openSidebar();

      chrome.storage.local.get(
        ["extensionReady", "selectedWorkspace"],
        ({ extensionReady, selectedWorkspace }) => {
          if (request.workspaceId != selectedWorkspace) {
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
    } catch (err) {
      log("[onMessageExternal] Error opening sidebar:", err);
    }
  });

  return true;
});

/**
 * Authenticate the user using WorkOS.
 */
const authenticate = async (
  { connection, organizationId }: AuthBackgroundMessage,
  sendResponse: (
    auth: OAuthAuthorizeResponse | AuthBackgroundResponseError
  ) => void
) => {
  // First we call /authorize endpoint to get the authorization code (PKCE flow).
  const redirectUrl = chrome.identity.getRedirectURL();

  const workspaceId =
    connection && connection.startsWith("workspace-")
      ? connection.split("workspace-")[1]
      : "";

  const options: Record<string, string> = {
    redirect_uri: redirectUrl,
    workspaceId: workspaceId,
    ...(organizationId ? { organizationId } : {}),
  };

  const queryString = new URLSearchParams(options).toString();

  const authUrl = `${DUST_US_URL}/api/workos/login?${queryString}`;

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
        const data = await exchangeCodeForTokens(authorizationCode);
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

      const regionInfo = await platform.auth.getRegionInfoFromStorage();
      if (!regionInfo) {
        log("No region info found for token refresh.");
        const handlers = state.refreshRequests;
        state.refreshRequests = [];
        handlers.forEach((sendResponse) => {
          sendResponse({
            success: false,
            error: "No region info found for token refresh.",
          });
        });
        return;
      }

      const response = await fetch(
        `${regionInfo.url}/api/workos/authenticate`,
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
          accessToken: data.accessToken,
          refreshToken: data.refreshToken || refreshToken,
          expiresIn: DEFAULT_TOKEN_EXPIRY_IN_SECONDS,
          authentication_method: data.authenticationMethod,
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
  code: string
): Promise<OAuthAuthorizeResponse | AuthBackgroundResponseError> => {
  try {
    const tokenParams: Record<string, string> = {
      code,
    };

    const response = await fetch(`${DUST_US_URL}/api/workos/authenticate`, {
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
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresIn: DEFAULT_TOKEN_EXPIRY_IN_SECONDS,
      authentication_method: data.authenticationMethod,
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

  const logoutUrl = `${DUST_US_URL}/api/workos/logout-url?${new URLSearchParams(
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
