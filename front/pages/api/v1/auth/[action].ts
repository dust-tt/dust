import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { makeEnterpriseConnectionName } from "@app/lib/api/enterprise_connection";
import { getWorkOS } from "@app/lib/api/workos/client";
import { getFeatureFlags } from "@app/lib/auth";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { renderLightWorkspaceType } from "@app/lib/workspace";
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
    authorizeUri: config.getWorkOSIssuerURL() + "/oauth2/authorize",
    authenticateUri: config.getWorkOSIssuerURL() + "/oauth2/token",
    logoutUri: config.getWorkOSIssuerURL() + "/oauth2/logout",
    clientId: config.getWorkOSExtensionClientId(),
    scopes: "openid profile email offline_access",
  },
  auth0: {
    name: "auth0",
    authorizeUri: "https://" + config.getAuth0TenantUrl() + "/authorize",
    authenticateUri: "https://" + config.getAuth0TenantUrl() + "/oauth/token",
    logoutUri: "https://" + config.getAuth0TenantUrl() + "/v2/logout",
    clientId: config.getAuth0ExtensionApplicationId(),
    scopes:
      "offline_access read:user_profile read:conversation create:conversation update:conversation read:agent read:file create:file delete:file",
  },
};

async function getProvider(
  query: Partial<{
    [key: string]: string | string[];
  }>,
  workspace: WorkspaceModel | null
): Promise<Provider> {
  if (workspace) {
    const lightWorkspace = renderLightWorkspaceType({ workspace });
    const featureFlags = await getFeatureFlags(lightWorkspace);
    if (
      featureFlags.includes("okta_enterprise_connection") &&
      !featureFlags.includes("workos")
    ) {
      return providers["auth0"];
    }
  }

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
    ? await WorkspaceModel.findOne({
        where: {
          sId: workspaceId,
        },
      })
    : null;

  const provider = await getProvider(query, workspace);

  const options: Record<string, string | undefined> = {
    client_id: provider.clientId,
    scope: provider.scopes,
  };

  // Default to extension client id if not provided, otherwise use the client id from the query
  if (query.client_id) {
    options.client_id = `${query.client_id}`;
  }

  if (provider.name === "workos") {
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
  } else {
    if (workspace) {
      options.connection = makeEnterpriseConnectionName(workspace.sId);
    }
    options.prompt = `${query.prompt}`;
    options.audience = `${query.audience}`;
  }

  const params = new URLSearchParams({
    ...options,
    response_type: `${query.response_type}`,
    redirect_uri: `${query.redirect_uri}`,
    code_challenge_method: `${query.code_challenge_method}`,
    code_challenge: `${query.code_challenge}`,
    state: JSON.stringify({
      provider: provider.name,
    }),
  });

  const authorizeUrl = `${provider.authorizeUri}?${params}`;
  res.redirect(authorizeUrl);
}

async function handleAuthenticate(req: NextApiRequest, res: NextApiResponse) {
  try {
    const provider = await getProvider(req.query, null);
    const response = await fetch(`${provider.authenticateUri}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: req.headers.origin || "",
      },
      credentials: "include",
      body: new URLSearchParams({
        client_id: provider.clientId,
        ...req.body,
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
  const provider = await getProvider(query, null);
  const params = new URLSearchParams({
    client_id: provider.clientId,
    ...query,
  }).toString();
  const logoutUrl = `${provider.logoutUri}?${params}`;
  res.redirect(logoutUrl);
}
