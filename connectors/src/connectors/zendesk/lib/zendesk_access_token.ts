import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import logger from "@connectors/logger/logger";

export async function getZendeskSubdomainAndAccessToken(
  connectionId: string
): Promise<{ accessToken: string; subdomain: string }> {
  const token = await getOAuthConnectionAccessTokenWithThrow({
    logger,
    provider: "zendesk",
    connectionId,
  });
  if (typeof token.connection.metadata.zendesk_subdomain !== "string") {
    // If the zendesk connection metadata does not have a `zendesk_subdomain` entry we throw an
    // ExternalOAuthTokenError since this it requires a re-authentication.
    throw new ExternalOAuthTokenError(
      new Error(
        `Missing zendesk connection metadata subdomain: connectionId=${connectionId}`
      )
    );
  }
  return {
    accessToken: token.access_token,
    subdomain: token.connection.metadata.zendesk_subdomain,
  };
}
