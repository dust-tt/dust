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

/**
 * @cc [owner:smb2268,label:error-handling] salesforce-sign-in-error-throws
 * Under the exception in `no-catching-own-errors`, this function MUST throw `ExternalOAuthTokenError`
 * when the Salesforce token refresh fails with a sign-in error (`invalid_grant`,
 * `oauth_flow_disabled`, `app_not_found`) so that Temporal activities stop instead of retrying.
 * Callers at API boundaries MAY catch it with `instanceof ExternalOAuthTokenError`. Other failures
 * MUST propagate unchanged.
 */
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
      err.message.includes("oauth_flow_disabled") ||
      err.message.includes("app_not_found"))
  );
}
