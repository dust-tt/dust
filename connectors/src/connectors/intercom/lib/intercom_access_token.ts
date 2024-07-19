import { getOAuthConnectionAccessToken } from "@dust-tt/types";

import { apiConfig } from "@connectors/lib/api/config";
import { getAccessTokenFromNango } from "@connectors/lib/nango_helpers";
import { isDualUseOAuthConnectionId } from "@connectors/lib/oauth";
import logger from "@connectors/logger/logger";

const { NANGO_INTERCOM_CONNECTOR_ID } = process.env;

export async function getIntercomAccessToken(
  connectionId: string
): Promise<string> {
  if (isDualUseOAuthConnectionId(connectionId)) {
    const tokRes = await getOAuthConnectionAccessToken({
      config: apiConfig.getOAuthAPIConfig(),
      logger,
      provider: "intercom",
      connectionId,
    });
    if (tokRes.isErr()) {
      logger.error(
        { connectionId, error: tokRes.error },
        "Error retrieving Intercom access token"
      );
      throw new Error("Error retrieving Intercom access token");
    }

    return tokRes.value.access_token;
  } else {
    // TODO(@fontanierh) INTERCOM_MIGRATION remove once migrated
    if (!NANGO_INTERCOM_CONNECTOR_ID) {
      throw new Error("NANGO_INTERCOM_CONNECTOR_ID is not defined");
    }
    return getAccessTokenFromNango({
      connectionId: connectionId,
      integrationId: NANGO_INTERCOM_CONNECTOR_ID,
      useCache: true,
    });
  }
}
