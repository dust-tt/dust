import type { Result } from "@dust-tt/types";
import { Err, isValidSalesforceDomain, Ok } from "@dust-tt/types";

import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import logger from "@connectors/logger/logger";

export type SalesforceAPICredentials = {
  accessToken: string;
  instanceUrl: string;
};

export async function getSalesforceCredentials(
  connectionId: string
): Promise<Result<SalesforceAPICredentials, Error>> {
  const creds = await getOAuthConnectionAccessTokenWithThrow({
    logger,
    provider: "salesforce",
    connectionId,
  });

  const accessToken = creds.access_token;
  const instanceUrl = creds.connection.metadata.instance_url;

  if (!accessToken || !instanceUrl || !isValidSalesforceDomain(instanceUrl)) {
    return new Err(new Error("Invalid credentials"));
  }

  return new Ok({ accessToken, instanceUrl });
}
