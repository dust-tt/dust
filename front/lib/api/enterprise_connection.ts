import type { SupportedEnterpriseConnectionStrategies } from "@dust-tt/types";
import type { Connection } from "auth0";
import { ManagementClient } from "auth0";

import config from "@app/lib/api/config";

const management = new ManagementClient({
  domain: config.getAuth0IssuerBaseUrl(),
  clientId: config.getAuth0M2MClientId(),
  clientSecret: config.getAuth0M2MClientSecret(),
});

function makeEnterpriseConnectionName(workspaceId: string) {
  return `workspace-${workspaceId}`;
}

export async function getEnterpriseConnectionForWorkspace(
  workspaceId: string,
  strategy: SupportedEnterpriseConnectionStrategies = "okta"
) {
  // This endpoint supports fetching up to 1000 connections in one page.
  // In the future, consider implementing pagination to handle larger datasets.
  const connections = await management.connections.getAll({
    strategy: [strategy],
  });

  const expectedConnectionName = makeEnterpriseConnectionName(workspaceId);
  return connections.data.find((c) => c.name === expectedConnectionName);
}

interface EnterpriseConnectionDetails {
  clientId: string;
  clientSecret: string;
  domain: string;
  strategy: SupportedEnterpriseConnectionStrategies;
}

export async function createEnterpriseConnection(
  {
    workspaceId,
    verifiedDomain,
  }: {
    workspaceId: string;
    verifiedDomain: string | null;
  },
  connectionDetails: EnterpriseConnectionDetails
): Promise<Connection> {
  const connection = await management.connections.create({
    name: makeEnterpriseConnectionName(workspaceId),
    display_name: makeEnterpriseConnectionName(workspaceId),
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
  workspaceId: string,
  strategy: SupportedEnterpriseConnectionStrategies = "okta"
) {
  const existingConnection = await getEnterpriseConnectionForWorkspace(
    workspaceId,
    strategy
  );
  if (!existingConnection) {
    throw new Error("Enterprise connection not found.");
  }

  return management.connections.delete({
    id: existingConnection.id,
  });
}
