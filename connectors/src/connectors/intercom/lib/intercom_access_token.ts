import { getAccessTokenFromNango } from "@connectors/lib/nango_helpers";
import {
  getOAuthConnectionAccessTokenWithThrow,
  isDualUseOAuthConnectionId,
} from "@connectors/lib/oauth";
import logger from "@connectors/logger/logger";

const { NANGO_INTERCOM_CONNECTOR_ID } = process.env;

export async function getIntercomAccessToken(
  connectionId: string
): Promise<string> {
  if (isDualUseOAuthConnectionId(connectionId)) {
    const token = await getOAuthConnectionAccessTokenWithThrow({
      logger,
      provider: "intercom",
      connectionId,
    });
    return token.access_token;
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
