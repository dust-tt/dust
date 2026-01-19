import type { NextApiRequest, NextApiResponse } from "next";

import { isString } from "@app/types/shared/utils/general";

// App ID 1073173 is stable across deployments
const ZENDESK_APP_ID = "1073173";

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

  // Validate required parameters
  if (!isString(state)) {
    return res.status(400).json({
      error: "Missing required parameters",
    });
  }

  const zendeskCallbackUrl = decodeState(state);
  if (!zendeskCallbackUrl) {
    return res.status(400).json({
      error: "Invalid state parameter",
    });
  }

  const redirectUrl = new URL(zendeskCallbackUrl);

  const expectedHostname = `${ZENDESK_APP_ID}.apps.zdusercontent.com`;
  const expectedPathPrefix = `/${ZENDESK_APP_ID}/`;

  if (
    redirectUrl.hostname !== expectedHostname ||
    !redirectUrl.pathname.startsWith(expectedPathPrefix)
  ) {
    return res.status(400).json({
      error: "Invalid callback URL",
    });
  }

  if (isString(error)) {
    redirectUrl.searchParams.set("error", error);
    if (isString(error_description)) {
      redirectUrl.searchParams.set("error_description", error_description);
    }
    return res.redirect(redirectUrl.toString());
  }

  if (!isString(code)) {
    return res.status(400).json({
      error: "Missing required parameters",
    });
  }

  redirectUrl.searchParams.set("code", code);

  return res.redirect(redirectUrl.toString());
}

/**
 * Decode the state parameter (base64url encoded JSON with the Zendesk callback URL)
 */
function decodeState(state: string): string | undefined {
  // Base64url decode
  const base64 = state.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const decoded = Buffer.from(padded, "base64").toString("utf-8");

  // Parse JSON and extract callback URL
  const stateObj = JSON.parse(decoded);
  if (isString(stateObj.callback_url)) {
    return stateObj.callback_url;
  }
}
