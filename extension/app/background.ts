import { getToken, login, logout } from "./src/lib/auth";

/**
 * Listener to open/close the side panel when the user clicks on the extension icon.
 */
chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LOGIN") {
    login()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("Login error:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === "GET_TOKEN") {
    getToken()
      .then((token) => {
        sendResponse({ success: true, token });
      })
      .catch((error) => {
        console.error("Get token error:", error);
        console.error("Stack trace:", error.stack); // Add this line
        sendResponse({
          success: false,
          error: error.message,
          stack: error.stack,
        });
      });
    return true;
  }

  if (message.type === "LOGOUT") {
    logout()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("Logout error:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});
