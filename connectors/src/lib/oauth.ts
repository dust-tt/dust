import type {
  OAuthConnectionType,
  OAuthProvider,
} from "@dust-tt/types";
import { getOAuthConnectionAccessToken } from "@dust-tt/types";
import type { LoggerInterface } from "@dust-tt/types/dist/shared/logger";

import { apiConfig } from "@connectors/lib/api/config";
import { ExternalOauthTokenError } from "@connectors/lib/error";

// This function is used to discreminate between a new OAuth connection and an old Nango/Github
// connection. It is used to support dual-use while migrating and should be unused by a connector
// once fully migrated
export function isDualUseOAuthConnectionId(connectionId: string): boolean {
  // TODO(spolu): make sure this function is removed once fully migrated.
  return connectionId.startsWith("con_");
}

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
  access_token_expiry: number;
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

    if (tokRes.error.code === "token_revoked_error") {
      throw new ExternalOauthTokenError();
    } else {
      throw new Error(`Error retrieving access token from ${provider}`);
    }
  }

  return tokRes.value;
}
