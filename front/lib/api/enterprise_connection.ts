import type { SupportedEnterpriseConnectionStrategies } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { Connection } from "auth0";

import { getAuth0ManagemementClient } from "@app/lib/api/auth0";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";

function makeEnterpriseConnectionName(workspaceId: string) {
  return `workspace-${workspaceId}`;
}

export function makeEnterpriseConnectionInitiateLoginUrl(workspaceId: string) {
  return `${config.getClientFacingUrl()}/api/auth/login?connection=${makeEnterpriseConnectionName(
    workspaceId
  )}`;
}

export async function getEnterpriseConnectionForWorkspace(auth: Authenticator) {
  const owner = auth.getNonNullableWorkspace();

  const expectedConnectionName = makeEnterpriseConnectionName(owner.sId);

  const connections = await getAuth0ManagemementClient().connections.getAll({
    name: expectedConnectionName,
  });

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
  const owner = auth.getNonNullableWorkspace();

  const { sId } = owner;
  const connection = await getAuth0ManagemementClient().connections.create({
    name: makeEnterpriseConnectionName(sId),
    display_name: makeEnterpriseConnectionName(sId),
    strategy: connectionDetails.strategy,
    options: {
      ...getCreateConnectionPayloadFromConnectionDetails(connectionDetails),
      domain_aliases: verifiedDomain ? [verifiedDomain] : [],
      scope: "email profile openid",
    },
    is_domain_connection: false,
    realms: [],
    enabled_clients: [config.getAuth0WebApplicationId()],
    metadata: {},
  });

  return connection.data;
}

export async function deleteEnterpriseConnection(auth: Authenticator) {
  const existingConnection = await getEnterpriseConnectionForWorkspace(auth);
  if (!existingConnection) {
    throw new Error("Enterprise connection not found.");
  }

  return getAuth0ManagemementClient().connections.delete({
    id: existingConnection.id,
  });
}

function getCreateConnectionPayloadFromConnectionDetails(
  connectionDetails: EnterpriseConnectionDetails
) {
  switch (connectionDetails.strategy) {
    case "okta":
      return {
        domain: connectionDetails.domain,
        strategy: connectionDetails.strategy,
        client_id: connectionDetails.clientId,
        client_secret: connectionDetails.clientSecret,
      };

    case "waad":
      return {
        tenant_domain: connectionDetails.domain,
        strategy: connectionDetails.strategy,
        client_id: connectionDetails.clientId,
        client_secret: connectionDetails.clientSecret,
        // We trust the email from WAAD enterprise connection.
        should_trust_email_verified_connection: "always_set_emails_as_verified",
      };

    default:
      assertNever(connectionDetails.strategy);
  }
}
