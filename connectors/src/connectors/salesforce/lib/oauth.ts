import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import logger from "@connectors/logger/logger";
import { isValidSalesforceDomain } from "@connectors/types";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

export type SalesforceAPICredentials = {
  accessToken: string;
  instanceUrl: string;
};

export async function getSalesforceCredentials(
  connectionId: string
): Promise<Result<SalesforceAPICredentials, Error>> {
  try {
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
  } catch (e: unknown) {
    // So that will be catched upstream by ActivityInboundLogInterceptor and stop the workflow.
    if (isSalesforceSignInError(e)) {
      throw new ExternalOAuthTokenError(e);
    }

    throw e;
  }
}

function isSalesforceSignInError(err: unknown): err is Error {
  return (
    err instanceof Error &&
    err.message.startsWith(
      "Error retrieving access token from salesforce: code=provider_access_token_refresh_error"
    ) &&
    (err.message.includes("invalid_grant") ||
      err.message.includes("oauth_flow_disabled"))
  );
}
