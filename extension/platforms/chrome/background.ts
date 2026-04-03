import { ChromePlatformService } from "@extension/platforms/chrome/services/platform";
import {
  getActionHandler,
  registerConnectionListener,
  registerContextMenuTabListeners,
  registerForceUpdateListener,
  registerMessageListener,
} from "@extension/shared/background";

const log = console.error;

function isGoogleChrome(): boolean {
  const brands =
    (
      navigator as Navigator & {
        userAgentData?: { brands: { brand: string }[] };
      }
    ).userAgentData?.brands ?? [];
  return brands.some((b) => b.brand === "Google Chrome");
}

// Initialize the platform service.
const platform = new ChromePlatformService();

registerForceUpdateListener(platform);

/**
 * Listener to open/close the side panel when the user clicks on the extension icon.
 */
chrome.action.onClicked.addListener((tab) => {
  if (!isGoogleChrome() && tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: "toggleSidebar" }).catch(() => {
      // Content script is not available on this page (e.g. Arc blocked pages).
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  void platform.storage.set("extensionReady", false);
  void chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: isGoogleChrome(),
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

registerContextMenuTabListeners(platform);

registerConnectionListener(platform);

chrome.contextMenus.onClicked.addListener(async (event, tab) => {
  const handler = getActionHandler(event.menuItemId);
  if (!handler) {
    return;
  }

  // chrome.sidePanel.open() must be called synchronously within the user gesture
  // context. Any await before this call would break the gesture chain and throw:
  // "sidePanel.open() may only be called in response to a user gesture".
  if (tab) {
    void chrome.sidePanel.open({ windowId: tab.windowId });
  }

  const isExtensionReady =
    await platform.storage.get<boolean>("extensionReady");

  if (!isExtensionReady) {
    // Store the pending action for later use when the extension is ready.
    await platform.storage.set("pendingAction", event.menuItemId);
  } else {
    void handler();
  }
});

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
        })
        .catch((err) => {
          log("[onMessageExternal] Error opening side panel:", err);
        });
    }
  });

  return true;
});

registerMessageListener(platform);
