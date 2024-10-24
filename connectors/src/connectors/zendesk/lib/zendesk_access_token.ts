import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import logger from "@connectors/logger/logger";

export async function getZendeskAccessToken(
  connectionId: string
): Promise<string> {
  const token = await getOAuthConnectionAccessTokenWithThrow({
    logger,
    provider: "zendesk",
    connectionId,
  });
  return token.access_token;
}
