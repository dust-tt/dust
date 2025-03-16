import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import { ConnectorManagerError } from "@connectors/connectors/interface";
import type { SalesforceAPICredentials } from "@connectors/connectors/salesforce/lib/oauth";
import { getSalesforceCredentials } from "@connectors/connectors/salesforce/lib/oauth";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

export const getConnectorAndCredentials = async (
  connectorId: ModelId
): Promise<
  Result<
    { connector: ConnectorResource; credentials: SalesforceAPICredentials },
    ConnectorManagerError<"EXTERNAL_OAUTH_TOKEN_ERROR">
  >
> => {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const credentialsRes = await getSalesforceCredentials(connector.connectionId);
  if (credentialsRes.isErr()) {
    return new Err(
      new ConnectorManagerError(
        "EXTERNAL_OAUTH_TOKEN_ERROR",
        credentialsRes.error.message
      )
    );
  }
  const credentials = credentialsRes.value;

  return new Ok({
    connector,
    credentials,
  });
};
