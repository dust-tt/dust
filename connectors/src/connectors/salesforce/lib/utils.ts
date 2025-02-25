import { Err, Ok } from "@dust-tt/client";
import type { ModelId, Result } from "@dust-tt/types";

import { ConnectorManagerError } from "@connectors/connectors/interface";
import type { SalesforceAPICredentials } from "@connectors/connectors/salesforce/lib/oauth";
import { getSalesforceCredentials } from "@connectors/connectors/salesforce/lib/oauth";
import { ConnectorResource } from "@connectors/resources/connector_resource";

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

export const isStandardObjectIncluded = (objectName: string) => {
  const whitelist = [
    // Core sales objects.
    "Account",
    "Contact",
    "Lead",
    "Opportunity",
    // Activity tracking.
    "Task",
    "Event",
    "ActivityHistory",

    // Communication.
    "EmailMessage",
    "Case",
    "LiveChatTranscript", // chat conversations with prospects/customers.

    // Products & pricing
    "Product2", // note: correct API name is Product2, not Product.
    "Quote",
    "QuoteLineItem",
    "Contract",

    // Forecasting.
    "Forecast",
    "ForecastingQuota",

    // Other useful sales objects.
    "User", // sales rep info.
    "OpportunityLineItem", // products on opportunities.
    "ContentDocument", // files attached to records.
    "ContentVersion", // versions of files.
    "Note", // notes on records.
  ];
  return whitelist.includes(objectName);
};
