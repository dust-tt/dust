/* eslint-disable dust/enforce-client-types-in-public-api */
// Pass through to workOS, do not enforce return types.

import config from "@app/lib/api/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

const ALLOWED_CALLBACK_URL_PATTERNS: RegExp[] = [
  // Zendesk app: https://1073173.apps.zdusercontent.com/1073173/assets/<hash>/oauth-callback.html
  /^https:\/\/1073173\.apps\.zdusercontent\.com\/1073173\/assets\/[a-f0-9-]+\/oauth-callback\.html$/,
];

const workosConfig = {
  name: "workos",
  authorizeUri: "api.workos.com/user_management/authorize",
  authenticateUri: "api.workos.com/user_management/authenticate",
  logoutUri: "api.workos.com/user_management/sessions/logout",
  clientId: config.getWorkOSClientId(),
  scopes: "openid profile email offline_access",
};

/**
 * @ignoreswagger
 */
// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { action } = req.query;

  switch (action) {
    case "authorize":
      return handleAuthorize(req, res);
    case "authenticate":
      return handleAuthenticate(req, res);
    case "callback":
      return handleCallback(req, res);
    case "logout":
      return handleLogout(req, res);
    default:
      res.status(404).json({ error: "Action not found" });
  }
}

async function handleAuthorize(req: NextApiRequest, res: NextApiResponse) {
  const { query } = req;

  let workspaceId = undefined;
  if (
    typeof query.organization_id === "string" &&
    query.organization_id.startsWith("workspace-")
  ) {
    workspaceId = query.organization_id.split("workspace-")[1];
  }

  if (typeof query.workspaceId === "string") {
    workspaceId = query.workspaceId;
  }

  const workspace = workspaceId
    ? await WorkspaceResource.fetchById(workspaceId)
    : null;

  const options: Record<string, string | undefined> = {
    client_id: workosConfig.clientId,
    scope: workosConfig.scopes,
  };

  options.provider = "authkit";

  if (workspace) {
    const organizationId = workspace.workOSOrganizationId;
    if (!organizationId) {
      logger.error(
        `Workspace with sId ${workspaceId} does not have a WorkOS organization ID.`
      );
      res.status(400).json({
        error: "Workspace does not have a WorkOS organization ID",
      });
      return;
    }

    const connections = await getWorkOS().sso.listConnections({
      organizationId,
    });

    options.organizationId = organizationId;
    options.connectionId =
      connections.data.length > 0 ? connections.data[0]?.id : undefined;
  }

  const params = new URLSearchParams({
    ...options,
    response_type: `${query.response_type}`,
    redirect_uri: `${query.redirect_uri}`,
    code_challenge_method: `${query.code_challenge_method}`,
    code_challenge: `${query.code_challenge}`,
    state: JSON.stringify({
      provider: workosConfig.name,
      // Pass through client's state for OAuth proxy flows (e.g., Zendesk)
      client_state: isString(query.state) ? query.state : undefined,
    }),
  });

  const authorizeUrl = `https://${workosConfig.authorizeUri}?${params}`;
  res.redirect(authorizeUrl);
}

async function handleAuthenticate(req: NextApiRequest, res: NextApiResponse) {
  try {
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(`https://${workosConfig.authenticateUri}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        Origin: req.headers.origin || "",
      },
      credentials: "include",
      body: new URLSearchParams({
        ...req.body,
        client_id: workosConfig.clientId,
      }).toString(),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error({ error }, "Error in authenticate proxy");
    res.status(500).json({ error: "Internal server error" });
  }
}

async function handleLogout(req: NextApiRequest, res: NextApiResponse) {
  const { query } = req;
  const params = new URLSearchParams({
    ...query,
    client_id: workosConfig.clientId,
  }).toString();
  const logoutUrl = `https://${workosConfig.logoutUri}?${params}`;
  res.redirect(logoutUrl);
}

/**
 * OAuth callback proxy for apps with dynamic redirect URIs.
 */
async function handleCallback(req: NextApiRequest, res: NextApiResponse) {
  const { code, state, error, error_description } = req.query;

  if (!isString(state)) {
    return res.status(400).json({ error: "Missing state parameter" });
  }

  const callbackUrl = decodeClientState(state);
  if (!callbackUrl) {
    return res.status(400).json({ error: "Invalid state parameter" });
  }

  // Validate the callback URL against allowed patterns
  if (!isAllowedCallbackUrl(callbackUrl)) {
    return res.status(400).json({ error: "Invalid callback URL" });
  }

  const redirectUrl = new URL(callbackUrl);

  // Forward error to callback if present
  if (isString(error)) {
    redirectUrl.searchParams.set("error", error);
    if (isString(error_description)) {
      redirectUrl.searchParams.set("error_description", error_description);
    }
    return res.redirect(redirectUrl.toString());
  }

  if (!isString(code)) {
    return res.status(400).json({ error: "Missing code parameter" });
  }

  redirectUrl.searchParams.set("code", code);
  return res.redirect(redirectUrl.toString());
}

function isAllowedCallbackUrl(url: string): boolean {
  return ALLOWED_CALLBACK_URL_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Decode the client_state from the WorkOS state parameter.
 * State format: { provider: "workos", client_state: "base64url encoded JSON" }
 * Client state format: { callback_url: "https://..." }
 */
function decodeClientState(state: string): string | undefined {
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
