import type { NextApiRequest, NextApiResponse } from "next";

/**
 * OAuth callback proxy for Zendesk app.
 *
 * This endpoint solves the problem of Zendesk apps having dynamic redirect URIs
 * that change on every deployment (due to asset hashing). WorkOS doesn't support
 * wildcard paths in redirect URIs, so we use this stable endpoint as an intermediary.
 *
 * Flow:
 * 1. Zendesk app initiates OAuth with redirect_uri=https://dust.tt/api/oauth-zendesk/callback
 * 2. The actual Zendesk callback URL is encoded in the `state` parameter
 * 3. After OAuth, WorkOS redirects here with `code` and `state`
 * 4. This endpoint decodes `state` to get the real Zendesk URL and redirects there with the `code`
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code, state, error, error_description } = req.query;

  // Handle OAuth errors
  if (error) {
    const errorMsg = Array.isArray(error) ? error[0] : error;
    const errorDesc = Array.isArray(error_description)
      ? error_description[0]
      : error_description;

    // Try to redirect to Zendesk callback with error if we have state
    if (state) {
      try {
        const zendeskCallbackUrl = decodeState(state);
        const redirectUrl = new URL(zendeskCallbackUrl);
        redirectUrl.searchParams.set("error", errorMsg);
        if (errorDesc) {
          redirectUrl.searchParams.set("error_description", errorDesc);
        }
        return res.redirect(redirectUrl.toString());
      } catch {
        // If state decoding fails, show error page
      }
    }

    return res.status(400).json({
      error: errorMsg,
      error_description: errorDesc,
    });
  }

  // Validate required parameters
  if (!code || !state) {
    return res.status(400).json({
      error: "Missing required parameters",
      details: "Both 'code' and 'state' query parameters are required",
    });
  }

  const codeStr = Array.isArray(code) ? code[0] : code;

  // Decode state to get the actual Zendesk callback URL
  const zendeskCallbackUrl = decodeState(state);

  // Validate the callback URL is from Zendesk
  const url = new URL(zendeskCallbackUrl);
  if (!url.hostname.endsWith(".zdusercontent.com")) {
    return res.status(400).json({
      error: "Invalid callback URL",
      details: "Callback URL must be a Zendesk app URL",
    });
  }

  // Build the redirect URL with the authorization code
  const redirectUrl = new URL(zendeskCallbackUrl);
  redirectUrl.searchParams.set("code", codeStr);

  return res.redirect(redirectUrl.toString());
}

/**
 * Decode the state parameter (base64url encoded JSON with the Zendesk callback URL)
 */
function decodeState(state: string | string[]): string {
  const stateStr = Array.isArray(state) ? state[0] : state;

  // Base64url decode
  const base64 = stateStr.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const decoded = Buffer.from(padded, "base64").toString("utf-8");

  // Parse JSON and extract callback URL
  const stateObj = JSON.parse(decoded);
  if (!stateObj.callback_url || typeof stateObj.callback_url !== "string") {
    throw new Error("Missing callback_url in state");
  }

  return stateObj.callback_url;
}
