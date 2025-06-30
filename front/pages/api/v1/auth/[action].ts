import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import logger from "@app/logger/logger";

type Provider = {
  name: "workos" | "auth0";
  authorizeUri: string;
  authenticateUri: string;
  logoutUri: string;
  clientId: string;
  scopes: string;
};

const providers: Record<string, Provider> = {
  workos: {
    name: "workos",
    authorizeUri: "api.workos.com/user_management/authorize",
    authenticateUri: "api.workos.com/user_management/authenticate",
    logoutUri: "api.workos.com/user_management/sessions/logout",
    clientId: config.getWorkOSClientId(),
    scopes: "openid profile email",
  },
  auth0: {
    name: "auth0",
    authorizeUri: config.getAuth0TenantUrl() + "/authorize",
    authenticateUri: config.getAuth0TenantUrl() + "/oauth/token",
    logoutUri: config.getAuth0TenantUrl() + "/v2/logout",
    clientId: config.getAuth0ExtensionApplicationId(),
    scopes:
      "offline_access read:user_profile read:conversation create:conversation update:conversation read:agent read:file create:file delete:file",
  },
};

function getProvider(
  query: Partial<{
    [key: string]: string | string[];
  }>
): Provider {
  const forcedProvider =
    typeof query.forcedProvider === "string" ? query.forcedProvider : undefined;
  const provider = forcedProvider || config.getOAuthProvider();
  return providers[provider];
}

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
  const provider = getProvider(query);
  const workspace =
    typeof query.organization_id === "string" &&
    query.organization_id.startsWith("workspace-")
      ? query.organization_id.split("workspace-")[1]
      : undefined;

  const options: Record<string, string | undefined> = {
    client_id: provider.clientId,
    scope: provider.scopes,
  };

  if (provider.name === "workos") {
    options.provider = `${query.provider}`;

    if (workspace) {
      const w = await WorkspaceModel.findOne({
        where: {
          sId: workspace,
        },
      });
      if (!w) {
        logger.error(
          `Workspace with sId ${workspace} not found for WorkOS SSO connection.`
        );
        res.status(404).json({ error: "Workspace not found" });
        return;
      }

      const organizationId = w.workOSOrganizationId;
      if (!organizationId) {
        logger.error(
          `Workspace with sId ${workspace} does not have a WorkOS organization ID.`
        );
        res.status(400).json({
          error: "Workspace does not have a WorkOS organization ID",
        });
        return;
      }

      const connections = await getWorkOS().sso.listConnections({
        organizationId,
      });

      options.connectionId =
        connections.data.length > 0 ? connections.data[0]?.id : undefined;
    }
  } else {
    query.organization_id
      ? (options.connection = `${query.organization_id}`)
      : undefined;
    options.prompt = `${query.prompt}`;
    options.audience = `${query.audience}`;
  }

  const params = new URLSearchParams({
    ...options,
    response_type: `${query.response_type}`,
    redirect_uri: `${query.redirect_uri}`,
    code_challenge_method: `${query.code_challenge_method}`,
    code_challenge: `${query.code_challenge}`,
  });

  const authorizeUrl = `https://${provider.authorizeUri}?${params}`;
  res.redirect(authorizeUrl);
}

async function handleAuthenticate(req: NextApiRequest, res: NextApiResponse) {
  try {
    const provider = getProvider(req.query);
    const response = await fetch(`https://${provider.authenticateUri}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: req.headers.origin || "",
      },
      credentials: "include",
      body: new URLSearchParams({
        ...req.body,
        client_id: provider.clientId,
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
  const provider = getProvider(query);
  const params = new URLSearchParams({
    ...query,
    client_id: provider.clientId,
  }).toString();
  const authorizeUrl = `https://${provider.logoutUri}?${params}`;
  res.redirect(authorizeUrl);
}
