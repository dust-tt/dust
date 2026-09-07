import { apiConfig } from "@connectors/lib/api/config";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import type { OAuthConnectionType, OAuthProvider } from "@connectors/types";
import { getOAuthConnectionAccessToken } from "@connectors/types";
import type { LoggerInterface } from "@dust-tt/client";

/**
 * @cc [label:error-handling] oauth-access-token-or-error
 * Return the retrieved token and connection data from `oauth` on success. Generic `oauth` errors
 * and well-known provider specific error codes throw `ExternalOAuthTokenError`. Other unrecognized
 * OAuth failures throw regular `Error` (generally leading to retries).
 */
export async function getOAuthConnectionAccessTokenWithThrow({
  logger,
  provider,
  connectionId,
}: {
  logger: LoggerInterface;
  provider: OAuthProvider;
  connectionId: string;
}): Promise<{
  connection: OAuthConnectionType;
  access_token: string;
  access_token_expiry: number | null;
  scrubbed_raw_json: unknown;
}> {
  const tokRes = await getOAuthConnectionAccessToken({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    provider,
    connectionId,
  });

  if (tokRes.isErr()) {
    logger.error(
      { connectionId, error: tokRes.error, provider },
      "Error retrieving access token"
    );

    if (
      // Generic oauth error codes
      tokRes.error.code === "token_revoked_error" ||
      tokRes.error.code === "connection_not_found" ||
      // Happens with confluence
      (tokRes.error.code === "provider_access_token_refresh_error" &&
        tokRes.error.message.includes("Token was globally revoked")) ||
      // Happens with microsoft & gong
      (tokRes.error.code === "provider_access_token_refresh_error" &&
        (tokRes.error.message.includes("invalid_grant") ||
          tokRes.error.message.includes("invalid_client"))) ||
      // Happens with Google Drive.
      (tokRes.error.code === "provider_access_token_refresh_error" &&
        (tokRes.error.message.includes("Account Restricted") ||
          (provider === "google_drive" &&
            tokRes.error.message.includes("admin_policy_enforced"))))
    ) {
      throw new ExternalOAuthTokenError(new Error(tokRes.error.message));
    } else {
      throw new Error(
        `Error retrieving access token from ${provider}: code=${tokRes.error.code} message=${tokRes.error.message}`
      );
    }
  }

  return tokRes.value;
}
