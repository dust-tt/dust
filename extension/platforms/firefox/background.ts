// Firefox background script.
// Uses `browser.*` for Firefox-specific APIs (sidebarAction).
// All other `chrome.*` APIs work via Firefox's Chrome compatibility layer.

import { FirefoxPlatformService } from "@extension/platforms/firefox/services/platform";
import {
  getActionHandler,
  registerConnectionListener,
  registerContextMenuTabListeners,
  registerForceUpdateListener,
  registerMessageListener,
} from "@extension/shared/background";
import browser from "webextension-polyfill";

const platform = new FirefoxPlatformService();

registerForceUpdateListener(platform);

chrome.runtime.onInstalled.addListener(() => {
  void platform.storage.set("extensionReady", false);

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

chrome.action.onClicked.addListener(() => {
  void browser.sidebarAction.toggle();
});

chrome.contextMenus.onClicked.addListener(async (event) => {
  const handler = getActionHandler(event.menuItemId);
  if (!handler) {
    return;
  }

  // browser.sidebarAction.open() must be called synchronously within the user gesture
  // context. Any await before this call would break the gesture chain and throw:
  // "sidebarAction.open() may only be called in response to a user gesture".

  void browser.sidebarAction.open();

  const isExtensionReady =
    await platform.storage.get<boolean>("extensionReady");

  if (!isExtensionReady) {
    // Store the pending action for later use when the extension is ready.
    await platform.storage.set("pendingAction", event.menuItemId);
  } else {
    void handler();
  }
});

registerMessageListener(platform);
