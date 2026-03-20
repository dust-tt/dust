import type { ChromePlatformService } from "@extension/platforms/chrome/services/platform";
import type { FirefoxPlatformService } from "@extension/platforms/firefox/services/platform";
import {
  checkHasForm,
  clickPageElement,
  getPageElements,
  getPageElementsDiff,
  typeText,
} from "@extension/shared/interactWithPage";
import { DUST_US_URL } from "@extension/shared/lib/config";
import { extractPage } from "@extension/shared/lib/extraction";
import { htmlToMarkdown } from "@extension/shared/lib/html_to_markdown";
import { generatePKCE, normalizeError } from "@extension/shared/lib/utils";
import type {
  AuthBackgroundMessage,
  AuthBackgroundResponseError,
  AuthBackgroundResponseSuccess,
  CaptureMesssage,
  CaptureResponse,
  ClickPageElementMessage,
  ClickPageElementResponse,
  DeleteTextMessage,
  DeleteTextResponse,
  GetActiveTabBackgroundMessage,
  GetActiveTabBackgroundResponse,
  GetPageElementsMessage,
  GetPageElementsResponse,
  GetSessionInfoMessage,
  GetSessionInfoResponse,
  InputBarStatusMessage,
  TabActionMessage,
  TabActionResponse,
  TypeTextMessage,
  TypeTextResponse,
} from "@extension/shared/messages";
import type { OAuthAuthorizeResponse } from "@extension/shared/services/auth";
import type { FileData } from "@extension/shared/services/capture";
import type { PlatformService } from "@extension/shared/services/platform";
import { jwtDecode } from "jwt-decode";

const log = console.error;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (val) => {
        clearTimeout(timeout);
        resolve(val);
      },
      (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    );
  });
}

// Mutex to serialize tab capture operations. captureVisibleTab only captures
// the currently visible tab, so concurrent captures would produce duplicates.
let tabOpMutex: Promise<void> = Promise.resolve();
function withTabLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = tabOpMutex.then(fn, fn);
  tabOpMutex = next.then(
    () => {},
    () => {}
  );
  return next;
}

const shouldDisableContextMenuForDomain = async (
  url: string,
  platform: PlatformService
): Promise<boolean> => {
  if (
    url.startsWith("moz-extension://") ||
    url.startsWith("about:") ||
    url.startsWith("chrome://")
  ) {
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
        credentials: "omit",
      }
    );
    if (!res.ok) {
      return false;
    }
    const data = await res.json();
    const blacklistedDomains: string[] = data.blacklistedDomains ?? [];
    const hostname = new URL(url).hostname;
    return blacklistedDomains.some((d) =>
      d.startsWith("http://") || d.startsWith("https://")
        ? url.startsWith(d)
        : hostname.endsWith(d)
    );
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

/**
 * Listener for force update mechanism.
 */
export const registerForceUpdateListener = (
  platform: ChromePlatformService | FirefoxPlatformService
): void => {
  chrome.runtime.onUpdateAvailable.addListener(async (details) => {
    const pendingUpdate = {
      version: details.version,
      detectedAt: Date.now(),
    };
    await platform.savePendingUpdate(pendingUpdate);
  });
};

export const registerContextMenuTabListeners = (
  platform: PlatformService
): void => {
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url) {
      const isDisabled = await shouldDisableContextMenuForDomain(
        tab.url,
        platform
      );
      toggleContextMenus(isDisabled);
    }
  });

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      const isDisabled = await shouldDisableContextMenuForDomain(
        tab.url,
        platform
      );
      toggleContextMenus(isDisabled);
    }
  });
};

export const registerConnectionListener = (platform: PlatformService): void => {
  chrome.runtime.onConnect.addListener(async (port) => {
    if (port.name === "sidepanel-connection") {
      console.log("Sidepanel is there");
      void platform.storage.set("extensionReady", true);
      port.onDisconnect.addListener(async () => {
        // This fires when sidepanel closes
        console.log("Sidepanel was closed");
        await platform.storage.set("extensionReady", false);
      });
    }
  });
};

export const getActionHandler = (menuItemId: string | number) => {
  switch (menuItemId) {
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

const authState: {
  refreshingToken: boolean;
  refreshRequests: ((
    r: OAuthAuthorizeResponse | AuthBackgroundResponseError
  ) => void)[];
} = {
  refreshingToken: false,
  refreshRequests: [],
};

/**
 * Authenticate the user using WorkOS.
 */
const authenticate = async (
  { organizationId }: AuthBackgroundMessage,
  sendResponse: (
    auth: OAuthAuthorizeResponse | AuthBackgroundResponseError
  ) => void
) => {
  // First we call /authorize endpoint to get the authorization code (PKCE flow).
  const expectedRedirectUrl = chrome.identity.getRedirectURL();
  const { codeVerifier, codeChallenge } = await generatePKCE();

  const options: Record<string, string> = {
    redirect_uri: expectedRedirectUrl,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    ...(organizationId ? { organizationId } : {}),
  };

  const queryString = new URLSearchParams(options).toString();

  const authUrl = `${DUST_US_URL}/api/workos/login?${queryString}`;

  // Open auth flow in a regular tab instead of chrome.identity.launchWebAuthFlow
  // to avoid "Authorization page could not be loaded" errors when Google's OAuth
  // pages are slow and users double-click.
  const tab = await chrome.tabs.create({ url: authUrl });
  const tabId = tab.id;
  if (!tabId) {
    sendResponse({ success: false, error: "Failed to open auth tab." });
    return;
  }

  const cleanup = () => {
    chrome.tabs.onUpdated.removeListener(onUpdated);
    chrome.tabs.onRemoved.removeListener(onRemoved);
  };

  const onUpdated = async (
    updatedTabId: number,
    _changeInfo: chrome.tabs.OnUpdatedInfo,
    updatedTab: chrome.tabs.Tab
  ) => {
    if (updatedTabId !== tabId || !updatedTab.url) {
      return;
    }

    if (!updatedTab.url.startsWith(expectedRedirectUrl)) {
      return;
    }

    cleanup();
    void chrome.tabs.remove(tabId);

    const url = new URL(updatedTab.url);
    const queryParams = new URLSearchParams(url.search);

    if (url.href.includes("error")) {
      const error = queryParams.get("error") || "Unknown error";
      log(`Authentication error: ${error}`);
      sendResponse({ success: false, error: `Authentication error: ${error}` });
      return;
    }

    const authorizationCode = queryParams.get("code");
    if (authorizationCode) {
      const data = await exchangeCodeForTokens(authorizationCode, codeVerifier);
      sendResponse(data);
    } else {
      log(`Missing authorization code: ${updatedTab.url}`);
      sendResponse({ success: false, error: "Missing authorization code" });
    }
  };

  const onRemoved = (removedTabId: number) => {
    if (removedTabId !== tabId) {
      return;
    }
    cleanup();
    sendResponse({
      success: false,
      error: "Authentication cancelled: tab was closed.",
    });
  };

  chrome.tabs.onUpdated.addListener(onUpdated);
  chrome.tabs.onRemoved.addListener(onRemoved);
};

/**
 * Refresh the access token using the refresh token.
 */
const refreshToken = async (
  platform: PlatformService,
  refreshToken: string,
  sendResponse: (
    auth: OAuthAuthorizeResponse | AuthBackgroundResponseError
  ) => void
) => {
  authState.refreshRequests.push(sendResponse);
  if (!authState.refreshingToken) {
    authState.refreshingToken = true;
    try {
      const tokenParams: Record<string, string> = {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      };

      const regionInfo = await platform.auth.getRegionInfoFromStorage();
      if (!regionInfo) {
        log("No region info found for token refresh.");
        const handlers = authState.refreshRequests;
        authState.refreshRequests = [];
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

      const handlers = authState.refreshRequests;
      authState.refreshRequests = [];
      handlers.forEach((sendResponse) => {
        sendResponse({
          success: true,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken || refreshToken,
          expirationDate: data.expirationDate,
          authentication_method: data.authenticationMethod,
        });
      });
    } catch (error) {
      log("Token refresh failed", error);
      const handlers = authState.refreshRequests;
      authState.refreshRequests = [];
      handlers.forEach((sendResponse) => {
        sendResponse({
          success: false,
          error: `Token refresh failed: ${error}`,
        });
      });
    } finally {
      authState.refreshingToken = false;
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
      code_verifier: codeVerifier,
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
      expirationDate: data.expirationDate,
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
  platform: PlatformService,
  sendResponse: (
    response: AuthBackgroundResponseSuccess | AuthBackgroundResponseError
  ) => void
) => {
  const accessToken = await platform.auth.getAccessToken();
  if (!accessToken) {
    log("No access token found for WorkOS logout.");
    sendResponse({ success: false, error: "No access token found." });
    return;
  }

  const decodedPayload = jwtDecode<Record<string, string>>(accessToken);
  const sessionId = decodedPayload?.sid;
  if (!sessionId) {
    log("No session ID found in access token.");
    sendResponse({ success: false, error: "No session ID found." });
    return;
  }

  try {
    const response = await fetch(`${DUST_US_URL}/api/workos/revoke-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "omit",
      body: JSON.stringify({ session_id: sessionId }),
    });

    if (!response.ok) {
      log("Revoke session failed:", response.status);
      sendResponse({
        success: false,
        error: `Revoke session failed: ${response.status}`,
      });
      return;
    }

    sendResponse({ success: true });
  } catch (error) {
    log("Revoke session failed:", error);
    sendResponse({
      success: false,
      error: `Revoke session failed: ${error}`,
    });
  }
};

function capture(
  platform: PlatformService,
  sendResponse: (x: CaptureResponse) => void
) {
  void platform.captureVisibleTab().then((dataURI) => {
    if (dataURI) {
      sendResponse({ dataURI });
    }
  });
}

export const registerMessageListener = (platform: PlatformService) => {
  chrome.runtime.onMessage.addListener(
    (
      message:
        | AuthBackgroundMessage
        | GetActiveTabBackgroundMessage
        | CaptureMesssage
        | InputBarStatusMessage
        | TabActionMessage
        | GetPageElementsMessage
        | ClickPageElementMessage
        | TypeTextMessage
        | DeleteTextMessage
        | GetSessionInfoMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (
        response:
          | OAuthAuthorizeResponse
          | AuthBackgroundResponseSuccess
          | AuthBackgroundResponseError
          | CaptureResponse
          | GetActiveTabBackgroundResponse
          | TabActionResponse
          | GetPageElementsResponse
          | ClickPageElementResponse
          | TypeTextResponse
          | DeleteTextResponse
          | GetSessionInfoResponse
      ) => void
    ): boolean | undefined => {
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
          void refreshToken(platform, message.refreshToken, sendResponse);
          return true;
        case "LOGOUT":
          void logout(platform, sendResponse);
          return true; // Keep the message channel open.

        case "SIGN_CONNECT":
          return true;

        case "CAPTURE":
          capture(platform, sendResponse);
          return true;

        case "GET_ACTIVE_TAB":
          void (async () => {
            let tab: chrome.tabs.Tab | undefined;
            if (message.tabId) {
              tab = await chrome.tabs.get(message.tabId);
            } else {
              const tabs = await chrome.tabs.query({
                active: true,
                currentWindow: true,
              });
              tab = tabs[0];
            }

            if (!tab?.id) {
              log("No active tab found.");
              sendResponse({ url: "", content: "", title: "" });
              return;
            }

            if (
              tab.url &&
              (await shouldDisableContextMenuForDomain(tab.url, platform))
            ) {
              sendResponse({
                url: tab.url || "",
                content: "",
                title: "",
                error: "Capture is disabled for this domain.",
              });
              return;
            }

            try {
              const includeContent = message.includeContent ?? true;
              const includeCapture = message.includeCapture ?? false;
              const [mimetypeExecution] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => document.contentType,
              });

              // 45 MB: base64 encoding adds ~33% overhead, keeping the
              // serialized message well under Chrome's 64 MB limit.
              const MAX_FILE_SIZE_BYTES = 45 * 1024 * 1024;

              let captures: string[] | undefined;
              let fileData: FileData | undefined;
              if (includeCapture) {
                // Chrome's built-in PDF viewer does not expose document.contentType
                // via executeScript, so fall back to URL extension detection.
                const mimeType: string =
                  (mimetypeExecution.result as string) ||
                  (() => {
                    const path = (tab.url || "").split("?")[0].toLowerCase();
                    if (path.endsWith(".pdf")) {
                      return "application/pdf";
                    }
                    if (path.endsWith(".png")) {
                      return "image/png";
                    }
                    if (path.endsWith(".jpg") || path.endsWith(".jpeg")) {
                      return "image/jpeg";
                    }
                    if (path.endsWith(".gif")) {
                      return "image/gif";
                    }
                    if (path.endsWith(".webp")) {
                      return "image/webp";
                    }
                    if (path.endsWith(".svg")) {
                      return "image/svg+xml";
                    }
                    return "";
                  })();

                const isAttachableFile =
                  tab.url &&
                  tab.url.startsWith("https://") &&
                  (mimeType === "application/pdf" ||
                    mimeType.startsWith("image/"));

                // Serialize capture operations: captureVisibleTab only captures
                // the currently visible tab, so concurrent captures would race.
                ({ captures, fileData } = await withTabLock(async () => {
                  // If targeting a non-active tab, activate it first so
                  // captureVisibleTab and full-page capture work correctly.
                  let previousTabId: number | undefined;
                  if (!tab.active && tab.id) {
                    const [activeTab] = await chrome.tabs.query({
                      active: true,
                      windowId: tab.windowId,
                    });
                    previousTabId = activeTab?.id;
                    await chrome.tabs.update(tab.id, { active: true });
                    // Brief wait for the tab to render.
                    await new Promise((r) => setTimeout(r, 500));
                  }

                  let resultCaptures: string[] | undefined;
                  let resultFileData: FileData | undefined;
                  try {
                    if (mimeType === "text/html") {
                      // Full page capture
                      await chrome.scripting.executeScript({
                        target: { tabId: tab.id! },
                        files: ["page.js"],
                      });
                      resultCaptures = await new Promise<string[]>(
                        (resolve, reject) => {
                          if (tab?.id) {
                            const timeout = setTimeout(() => {
                              console.error(
                                "Timeout waiting for full page capture"
                              );
                              reject(
                                new Error(
                                  "Timeout waiting for full page screenshot."
                                )
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
                        }
                      );
                    } else if (isAttachableFile) {
                      // Fetch the file by injecting a script into the tab so that
                      // the request runs in the page's origin (same-origin, no
                      // CORS) and is not subject to the extension's own
                      // content_security_policy. Falls back to a visible-tab
                      // screenshot if the file is too large or the fetch fails.
                      try {
                        const [fetchExecution] =
                          await chrome.scripting.executeScript({
                            target: { tabId: tab.id! },
                            func: async (
                              url: string,
                              maxBytes: number
                            ): Promise<
                              { base64: string } | { error: string }
                            > => {
                              try {
                                const response = await fetch(url);
                                if (!response.ok) {
                                  return { error: `HTTP ${response.status}` };
                                }
                                const contentLength =
                                  response.headers.get("content-length");
                                if (
                                  contentLength &&
                                  parseInt(contentLength) > maxBytes
                                ) {
                                  return { error: "too-large" };
                                }
                                const buffer = await response.arrayBuffer();
                                if (buffer.byteLength > maxBytes) {
                                  return { error: "too-large" };
                                }
                                const bytes = new Uint8Array(buffer);
                                const chunkSize = 8192;
                                let binary = "";
                                for (
                                  let i = 0;
                                  i < bytes.byteLength;
                                  i += chunkSize
                                ) {
                                  binary += String.fromCharCode(
                                    ...bytes.subarray(i, i + chunkSize)
                                  );
                                }
                                return { base64: btoa(binary) };
                              } catch (e) {
                                return { error: String(e) };
                              }
                            },
                            args: [tab.url as string, MAX_FILE_SIZE_BYTES],
                          });

                        const result = fetchExecution?.result;
                        if (!result || "error" in result) {
                          throw new Error(
                            result && "error" in result
                              ? result.error
                              : "Failed to fetch file"
                          );
                        }
                        resultFileData = {
                          base64: result.base64,
                          mimeType,
                          url: tab.url as string,
                        };
                      } catch (fetchError) {
                        console.warn(
                          "File fetch failed, falling back to screenshot:",
                          fetchError
                        );
                        resultCaptures = [
                          await withTimeout(
                            platform.captureVisibleTab(),
                            2000,
                            "Timeout waiting for page screenshot"
                          ),
                        ];
                      }
                    } else {
                      resultCaptures = [
                        await withTimeout(
                          platform.captureVisibleTab(),
                          2000,
                          "Timeout waiting for page screenshot"
                        ),
                      ];
                    }
                  } finally {
                    // Restore the previously active tab.
                    if (previousTabId !== undefined) {
                      await chrome.tabs.update(previousTabId, { active: true });
                    }
                  }
                  return { captures: resultCaptures, fileData: resultFileData };
                }));

                if (!fileData && (!captures || captures.length === 0)) {
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
                  const [execution] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: extractPage(),
                  });
                  const html = execution?.result;
                  content = html ? htmlToMarkdown(html) : "no content.";
                }
              }
              sendResponse({
                title: tab.title || "",
                url: tab.url || "",
                content,
                captures,
                fileData,
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
          })();
          return true;

        case "LIST_TABS":
          void (async () => {
            const tabs = await chrome.tabs.query({ currentWindow: true });
            sendResponse({
              success: true,
              tabs: tabs
                .filter((t) => t.id !== undefined && t.url)
                .map((t) => ({
                  tabId: t.id!,
                  title: t.title || "",
                  url: t.url || "",
                  active: t.active,
                })),
            });
          })();
          return true;

        case "ACTIVATE_TAB":
          void (async () => {
            try {
              await chrome.tabs.update(message.tabId, { active: true });
              sendResponse({ success: true });
            } catch (error) {
              sendResponse({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          })();
          return true;

        case "CLOSE_TAB":
          void (async () => {
            try {
              await chrome.tabs.remove(message.tabId);
              sendResponse({ success: true });
            } catch (error) {
              sendResponse({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          })();
          return true;

        case "OPEN_TAB":
          void (async () => {
            try {
              const tab = await chrome.tabs.create({ url: message.url });
              sendResponse({ success: true, tabId: tab.id });
            } catch (error) {
              sendResponse({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          })();
          return true;

        case "MOVE_TAB":
          void (async () => {
            try {
              await chrome.tabs.move(message.tabId, { index: message.index });
              sendResponse({ success: true });
            } catch (error) {
              sendResponse({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          })();
          return true;

        case "RELOAD_TAB":
          void (async () => {
            try {
              await chrome.tabs.reload(message.tabId);
              sendResponse({ success: true });
            } catch (error) {
              sendResponse({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          })();
          return true;

        case "GET_ELEMENTS":
          chrome.tabs.query({ currentWindow: true }, async (tabs) => {
            const tab = tabs.find((t) => t.id === message.tabId);
            try {
              const result = await getPageElements(tab);

              if (result.isErr()) {
                log("Error reading page elements:", result.error);
                sendResponse({
                  elements: "",
                  error: result.error.message,
                });
                return;
              }

              sendResponse({
                elements: result.value,
              });
            } catch (error) {
              const normalizedError = normalizeError(error);
              log("Error reading page elements:", normalizedError.message);
              sendResponse({
                elements: "",
                error:
                  normalizedError.message ?? "Failed to read page elements.",
              });
            }
          });
          return true;

        case "CLICK_ELEMENT":
          chrome.tabs.query({ currentWindow: true }, async (tabs) => {
            const tab = tabs.find((t) => t.id === message.tabId);
            try {
              const result = await clickPageElement(tab, message.elementId);

              if (result.isErr()) {
                log("Error clicking page element:", result.error);
                sendResponse({
                  success: false,
                  error: result.error.message,
                });
                return;
              }

              const elementsDiff = await getPageElementsDiff(tab);

              if (elementsDiff.isErr()) {
                log(
                  "Error getting page elements diff after click:",
                  elementsDiff.error
                );
                sendResponse({
                  success: false,
                  error: `Element clicked successfully. Error while getting page elements diff: ${elementsDiff.error.message}`,
                });
                return;
              }

              sendResponse({
                success: true,
                elementsDiff: elementsDiff.value,
              });
            } catch (error) {
              const normalizedError = normalizeError(error);
              log("Error clicking page element:", normalizedError.message);
              sendResponse({
                success: false,
                error:
                  normalizedError.message ?? "Failed to click page element.",
              });
            }
          });
          return true;

        case "TYPE_TEXT":
          chrome.tabs.query({ currentWindow: true }, async (tabs) => {
            const tab = tabs.find((t) => t.id === message.tabId);
            try {
              const result = await typeText(
                tab,
                message.elementId,
                message.text,
                message.variant
              );

              if (result.isErr()) {
                log("Error typing text in element:", result.error);
                sendResponse({
                  success: false,
                  error: result.error.message,
                });
                return;
              }

              const elementsDiff = await getPageElementsDiff(tab);

              if (elementsDiff.isErr()) {
                log(
                  "Error getting page elements diff after typing text:",
                  elementsDiff.error
                );
                sendResponse({
                  success: false,
                  error: `Text typed successfully. Error while getting page elements diff: ${elementsDiff.error.message}`,
                });
                return;
              }

              sendResponse({
                success: true,
                elementsDiff: elementsDiff.value,
              });
            } catch (error) {
              const normalizedError = normalizeError(error);
              log("Error typing text in element:", normalizedError.message);
              sendResponse({
                success: false,
                error:
                  normalizedError.message ?? "Failed to type text in element.",
              });
            }
          });
          return true;

        case "DELETE_TEXT":
          chrome.tabs.query({ currentWindow: true }, async (tabs) => {
            const tab = tabs.find((t) => t.id === message.tabId);
            try {
              const result = await typeText(
                tab,
                message.elementId,
                "",
                "delete"
              );

              if (result.isErr()) {
                log("Error deleting text in element:", result.error);
                sendResponse({
                  success: false,
                  error: result.error.message,
                });
                return;
              }

              const elementsDiff = await getPageElementsDiff(tab);

              if (elementsDiff.isErr()) {
                log(
                  "Error getting page elements diff after deleting text:",
                  elementsDiff.error
                );
                sendResponse({
                  success: false,
                  error: `Text deleted successfully. Error while getting page elements diff: ${elementsDiff.error.message}`,
                });
                return;
              }

              sendResponse({
                success: true,
                elementsDiff: elementsDiff.value,
              });
            } catch (error) {
              const normalizedError = normalizeError(error);
              log("Error deleting text in element:", normalizedError.message);
              sendResponse({
                success: false,
                error:
                  normalizedError.message ??
                  "Failed to delete text in element.",
              });
            }
          });
          return true;

        case "INPUT_BAR_STATUS":
          void (async () => {
            if (message.available) {
              const pendingAction =
                await platform.storage.get<string>("pendingAction");
              if (pendingAction) {
                getActionHandler(pendingAction)?.();
              }
            }
            await platform.storage.delete("pendingAction");
          })();
          return false;

        case "GET_SESSION_INFO":
          chrome.tabs.query({ currentWindow: true }, async (tabs) => {
            const activeTab = tabs.find((t) => t.active);

            try {
              const hasForm = await checkHasForm(activeTab);
              if (hasForm.isErr()) {
                sendResponse({
                  tabsCount: tabs.length,
                  currentTabHasForm: false,
                });
                return;
              }
              sendResponse({
                tabsCount: tabs.length,
                currentTabHasForm: hasForm.value,
              });
            } catch {
              sendResponse({
                tabsCount: tabs.length,
                currentTabHasForm: false,
              });
            }
          });
          return true;

        default:
          log(`Unknown message: ${JSON.stringify(message, null, 2)}.`);
          return false;
      }
    }
  );
};
