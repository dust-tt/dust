import { isValidSalesforceDomain } from "@dust-tt/types";

import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import logger from "@connectors/logger/logger";

export async function getSalesforceCredentials(
  connectionId: string
): Promise<{ accessToken: string; instanceUrl: string }> {
  const creds = await getOAuthConnectionAccessTokenWithThrow({
    logger,
    provider: "salesforce",
    connectionId,
  });

  const accessToken = creds.access_token;
  const instanceUrl = creds.connection.metadata.instance_url;

  if (!accessToken || !instanceUrl || !isValidSalesforceDomain(instanceUrl)) {
    throw new Error("Invalid credentials");
  }

  return { accessToken, instanceUrl };
}
