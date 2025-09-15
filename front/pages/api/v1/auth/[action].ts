/* eslint-disable dust/enforce-client-types-in-public-api */
// Pass through to workOS, do not enforce return types.
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";

/**
 * Sanitizes input object to prevent prototype pollution when used with URLSearchParams
 * Only allows specific whitelisted keys commonly used in OAuth flows
 */
function sanitizeForUrlSearchParams(input: Record<string, any> | undefined): Record<string, string> {
  const allowed = [
    'code',
    'redirect_uri', 
    'state',
    'grant_type',
    'code_verifier',
    'code_challenge',
    'code_challenge_method',
    'response_type',
    'scope',
    'session_token',
    'organization_id',
    'workspaceId',
    'provider',
    'organizationId',
    'connectionId'
  ];
  
  return Object.fromEntries(
    Object.entries(input || {})
      .filter(([k]) => allowed.includes(k))
      .map(([k, v]) => [k, String(v)])
  );
}

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
    }),
  });

  const authorizeUrl = `https://${workosConfig.authorizeUri}?${params}`;
  res.redirect(authorizeUrl);
}

async function handleAuthenticate(req: NextApiRequest, res: NextApiResponse) {
  try {
    const response = await fetch(`https://${workosConfig.authenticateUri}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: req.headers.origin || "",
      },
      credentials: "include",
      body: new URLSearchParams({
        ...sanitizeForUrlSearchParams(req.body || req.query),
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
    ...sanitizeForUrlSearchParams(query),
    client_id: workosConfig.clientId,
  }).toString();
  const logoutUrl = `https://${workosConfig.logoutUri}?${params}`;
  res.redirect(logoutUrl);
}
