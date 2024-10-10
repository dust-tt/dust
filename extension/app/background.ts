import { randomString } from "./src/lib/utils";
import {
  AUTH0_AUDIENCE,
  AUTH0_CLIENT_DOMAIN,
  AUTH0_CLIENT_ID,
  AuthBackroundMessage,
  Auth0AuthorizeResponse,
  AuthBackgroundResponse,
} from "./src/lib/auth";

/**
 * Listener to open/close the side panel when the user clicks on the extension icon.
 */
chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

/**
 * Listener for messages sent from the react app to the background script.
 * For now we use messages to authenticate the user.
 */
chrome.runtime.onMessage.addListener(
  (
    message: AuthBackroundMessage,
    sender,
    sendResponse: (
      response: Auth0AuthorizeResponse | AuthBackgroundResponse
    ) => void
  ) => {
    switch (message.type) {
      case "AUTHENTICATE":
        authenticate(sendResponse);
        return true; // Keep the message channel open for async response.

      case "LOGOUT":
        logout(sendResponse);
        return true; // Keep the message channel open.

      default:
        console.error(`Unknown message type: ${message.type}.`);
    }
  }
);

/**
 * Authenticate the user using Auth0.
 */
const authenticate = async (
  sendResponse: (auth: Auth0AuthorizeResponse | AuthBackgroundResponse) => void
) => {
  if (!AUTH0_CLIENT_ID || !AUTH0_CLIENT_DOMAIN) {
    console.error("Auth0 client ID or domain is missing.");
    return;
  }

  const redirectUrl = chrome.identity.getRedirectURL();
  const options = {
    client_id: AUTH0_CLIENT_ID,
    response_type: "id_token token code",
    scope: "offline_access openid profile email",
    redirect_uri: redirectUrl,
    nonce: randomString(16),
    audience: AUTH0_AUDIENCE,
  };

  const queryString = new URLSearchParams(options).toString();
  const authUrl = `https://${AUTH0_CLIENT_DOMAIN}/authorize?${queryString}`;

  chrome.identity.launchWebAuthFlow(
    { url: authUrl, interactive: true },
    (redirectUrl) => {
      if (chrome.runtime.lastError) {
        console.error(`Auth error: ${chrome.runtime.lastError.message}`);
        sendResponse({ success: false });
        return;
      }
      if (!redirectUrl || redirectUrl.includes("error")) {
        console.error(`Auth error in redirect URL: ${redirectUrl}`);
        sendResponse({ success: false });
        return;
      }

      const url = new URL(redirectUrl);
      const hashParams = new URLSearchParams(url.hash.substring(1));

      sendResponse({
        idToken: hashParams.get("id_token"),
        accessToken: hashParams.get("access_token"),
        code: hashParams.get("code"),
        expiresIn: hashParams.get("expires_in"),
      });
    }
  );
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
        console.error("Logout error:", chrome.runtime.lastError.message);
        sendResponse({ success: false });
      } else {
        sendResponse({ success: true });
      }
    }
  );
};
