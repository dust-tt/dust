import type { LoggerInterface } from "@dust-tt/client";

import { apiConfig } from "@connectors/lib/api/config";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import type { OAuthConnectionType, OAuthProvider } from "@connectors/types";
import { getOAuthConnectionAccessToken } from "@connectors/types";

// Most connectors are built on the assumption that errors are thrown with special handling of
// selected errors such as ExternalOauthTokenError. This function is used to retrieve an OAuth
// connection access token and throw an ExternalOauthTokenError if the token is revoked.
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
      tokRes.error.code === "token_revoked_error" ||
      tokRes.error.code === "connection_not_found" ||
      // Happens with confluence
      (tokRes.error.code === "provider_access_token_refresh_error" &&
        tokRes.error.message.includes("Token was globally revoked")) ||
      // Happens with microsoft
      (tokRes.error.code === "provider_access_token_refresh_error" &&
        tokRes.error.message.includes("invalid_grant"))
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
