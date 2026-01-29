import logger from "@app/logger/logger";
import type { OAuthConnectionType, OAuthProvider } from "@app/types";

interface OAuthMessageData {
  type: "connection_finalized";
  error?: string;
  connection?: OAuthConnectionType;
  provider: OAuthProvider;
}

export function postOAuthMessageAndClose(messageData: OAuthMessageData) {
  // Method 1: window.opener (preferred, direct communication).
  if (window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage(messageData, window.location.origin);
    } catch (e) {
      logger.error(
        { err: e },
        "[OAuth] window.opener.postMessage failed"
      );
    }
  } else {
    // Method 2: BroadcastChannel (fallback for modern browsers).
    try {
      const channel = new BroadcastChannel("oauth_finalize");
      channel.postMessage(messageData);
      setTimeout(() => channel.close(), 100);
    } catch (e) {
      logger.error({ err: e }, "[OAuth] BroadcastChannel failed");
    }
  }

  // Close window after a short delay to ensure message delivery.
  setTimeout(() => {
    window.close();
    // If window.close() fails, redirect to home.
    setTimeout(() => {
      window.location.href = window.location.origin;
    }, 100);
  }, 1000);
}
