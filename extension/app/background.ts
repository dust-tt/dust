import type { PendingUpdate } from "@extension/lib/storage";
import { savePendingUpdate } from "@extension/lib/storage";

import {
  AUTH0_AUDIENCE,
  AUTH0_CLIENT_DOMAIN,
  AUTH0_CLIENT_ID,
} from "./src/lib/config";
import type {
  Auth0AuthorizeResponse,
  AuthBackgroundResponse,
  AuthBackroundMessage,
  GetActiveTabBackgroundMessage,
  GetActiveTabBackgroundResponse,
} from "./src/lib/messages";
import { generatePKCE } from "./src/lib/utils";

const log = console.error;

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
});

/**
 * Listener for messages sent from the react app to the background script.
 * For now we use messages to authenticate the user.
 */
chrome.runtime.onMessage.addListener(
  (
    message: AuthBackroundMessage | GetActiveTabBackgroundMessage,
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

            try {
              const capture = message.includeScreenshot
                ? await chrome.tabs.captureVisibleTab()
                : undefined;

              const [result] = message.includeContent
                ? await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => document.documentElement.innerText,
                  })
                : [undefined];
              sendResponse({
                title: tab.title || "",
                url: tab.url || "",
                content: message.includeContent
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
