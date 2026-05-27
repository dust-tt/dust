import { isString } from "@app/types/shared/utils/general";

const ALLOWED_CALLBACK_URL_PATTERNS: RegExp[] = [
  // Zendesk app: https://1073173.apps.zdusercontent.com/1073173/assets/<hash>/oauth-callback.html
  /^https:\/\/1073173\.apps\.zdusercontent\.com\/1073173\/assets\/[a-f0-9-]+\/oauth-callback\.html$/,
  /^https:\/\/1070957\.apps\.zdusercontent\.com\/1070957\/assets\/[a-f0-9-]+\/oauth-callback\.html$/,
  /^https:\/\/dust-for-outlook\.vercel\.app\/oauth-callback\.html$/,
];

export function isAllowedCallbackUrl(url: string): boolean {
  return ALLOWED_CALLBACK_URL_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Decode the client_state from the WorkOS state parameter.
 * State format: { provider: "workos", client_state: "base64url encoded JSON" }
 * Client state format: { callback_url: "https://..." }
 */
export function decodeClientState(state: string): string | undefined {
  try {
    const outerState = JSON.parse(state);
    if (!isString(outerState.client_state)) {
      return undefined;
    }

    // Base64url decode the client_state
    const base64 = outerState.client_state
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf-8");

    const clientState = JSON.parse(decoded);
    if (isString(clientState.callback_url)) {
      return clientState.callback_url;
    }
  } catch {
    return undefined;
  }
}
