import type { SupportedEnterpriseConnectionStrategies } from "@dust-tt/types";
import type { Connection } from "auth0";
import { ManagementClient } from "auth0";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";

let auth0ManagemementClient: ManagementClient | null = null;

function getAuth0ManagemementClient(): ManagementClient {
  if (!auth0ManagemementClient) {
    auth0ManagemementClient = new ManagementClient({
      domain: config.getAuth0TenantUrl(),
      clientId: config.getAuth0M2MClientId(),
      clientSecret: config.getAuth0M2MClientSecret(),
    });
  }

  return auth0ManagemementClient;
}

function makeEnterpriseConnectionName(workspaceId: string) {
  return `workspace-${workspaceId}`;
}

export function makeEnterpriseConnectionInitiateLoginUrl(workspaceId: string) {
  return `${config.getClientFacingUrl()}/api/auth/login?connection=${makeEnterpriseConnectionName(
    workspaceId
  )}`;
}

export async function getEnterpriseConnectionForWorkspace(
  auth: Authenticator,
  strategy: SupportedEnterpriseConnectionStrategies = "okta"
) {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }

  // This endpoint supports fetching up to 1000 connections in one page.
  // In the future, consider implementing pagination to handle larger datasets.
  const connections = await getAuth0ManagemementClient().connections.getAll({
    strategy: [strategy],
  });

  const expectedConnectionName = makeEnterpriseConnectionName(owner.sId);
  return connections.data.find((c) => c.name === expectedConnectionName);
}

interface EnterpriseConnectionDetails {
  clientId: string;
  clientSecret: string;
  domain: string;
  strategy: SupportedEnterpriseConnectionStrategies;
}

export async function createEnterpriseConnection(
  auth: Authenticator,
  verifiedDomain: string | null,
  connectionDetails: EnterpriseConnectionDetails
): Promise<Connection> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error(
      "Workspace is required to enable an enterprise connection."
    );
  }

  const { sId } = owner;
  const connection = await getAuth0ManagemementClient().connections.create({
    name: makeEnterpriseConnectionName(sId),
    display_name: makeEnterpriseConnectionName(sId),
    strategy: connectionDetails.strategy,
    options: {
      client_id: connectionDetails.clientId,
      client_secret: connectionDetails.clientSecret,
      domain_aliases: verifiedDomain ? [verifiedDomain] : [],
      domain: connectionDetails.domain,
      scope: "email profile openid",
    },
    is_domain_connection: false,
    realms: [],
    enabled_clients: [config.getAuth0WebApplicationId()],
    metadata: {},
  });

  return connection.data;
}

export async function deleteEnterpriseConnection(
  auth: Authenticator,
  strategy: SupportedEnterpriseConnectionStrategies = "okta"
) {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error(
      "Workspace is required to delete an enterprise connection."
    );
  }

  const existingConnection = await getEnterpriseConnectionForWorkspace(
    auth,
    strategy
  );
  if (!existingConnection) {
    throw new Error("Enterprise connection not found.");
  }

  return getAuth0ManagemementClient().connections.delete({
    id: existingConnection.id,
  });
}
