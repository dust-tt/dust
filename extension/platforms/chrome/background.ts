import { ChromePlatformService } from "@extension/platforms/chrome/services/platform";
import {
  getActionHandler,
  registerConnectionListener,
  registerContextMenuTabListeners,
  registerForceUpdateListener,
  registerMessageListener,
} from "@extension/shared/background";
import { z } from "zod";

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
  chrome.contextMenus.create({
    id: "save_page_to_pod",
    title: "Save page to Pod",
    contexts: ["all"],
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

const openSidePanelSchema = z
  .object({
    action: z.literal("openSidePanel"),
    workspaceId: z.string().regex(/^[a-zA-Z0-9_-]{10,}$/),
    conversationId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{10,}$/)
      .optional(),
    agentId: z.string().optional(),
  })
  .refine((data) => data.conversationId || data.agentId, {
    message: "Either conversationId or agentId must be provided",
  });

const closeSidePanelSchema = z.object({
  action: z.literal("closeSidePanel"),
  workspaceId: z.string().regex(/^[a-zA-Z0-9_-]{10,}$/),
});

async function closeSidePanel(
  workspaceId: string,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): Promise<void> {
  const tab = sender.tab;
  if (!tab?.id || tab.windowId === undefined) {
    sendResponse({ success: false, error: "No sender tab available." });
    return;
  }

  try {
    const { selectedWorkspace } = await chrome.storage.local.get([
      "selectedWorkspace",
    ]);
    if (workspaceId !== selectedWorkspace) {
      log("[onMessageExternal] User selected another workspace.");
      sendResponse({ success: false, error: "Workspace mismatch." });
      return;
    }

    if (isGoogleChrome()) {
      if (typeof chrome.sidePanel.close !== "function") {
        sendResponse({
          success: false,
          error: "Closing the native side panel requires Chrome 141 or later.",
        });
        return;
      }

      await chrome.sidePanel.close({ windowId: tab.windowId });
      sendResponse({ success: true, closed: true });
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "closeSidebar",
    });
    sendResponse(response ?? { success: true, closed: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error closing side panel.";
    log("[onMessageExternal] Error closing side panel:", message);
    sendResponse({ success: false, error: message });
  }
}

/**
 * Listener for messages sent from external websites that are whitelisted on the manifest.
 * It allows to open the side panel and either navigate to an existing conversation
 * or open a new one with a pre-selected agent.
 *
 * Accepted payloads:
 *   - { action: "openSidePanel", workspaceId, conversationId }
 *     Opens an existing conversation directly.
 *   - { action: "openSidePanel", workspaceId, agentId }
 *     Opens a new conversation with the given agent pre-selected in the input bar.
 *   - { action: "closeSidePanel", workspaceId }
 *     Closes the side panel in the window that sent the message.
 *
 * We return true to keep the message channel open for async response.
 */
chrome.runtime.onMessageExternal.addListener(
  (request, sender, sendResponse) => {
    const closeParsed = closeSidePanelSchema.safeParse(request);
    if (closeParsed.success) {
      void closeSidePanel(closeParsed.data.workspaceId, sender, sendResponse);
      return true;
    }

    const parsed = openSidePanelSchema.safeParse(request);

    if (!parsed.success) {
      log("[onMessageExternal] Invalid params:", request);
      sendResponse({ success: false, error: "Invalid params." });
      return true;
    }

    const { workspaceId, conversationId, agentId } = parsed.data;
    const hasConversationId = !!conversationId;

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
                if (workspaceId != selectedWorkspace) {
                  log("[onMessageExternal] User selected another workspace.");
                  return;
                }

                const sendMessage = () => {
                  const params = JSON.stringify(
                    hasConversationId ? { conversationId } : { agentId }
                  );
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
  }
);

registerMessageListener(platform);
