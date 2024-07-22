import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import logger from "@connectors/logger/logger";

export async function getIntercomAccessToken(
  connectionId: string
): Promise<string> {
  const token = await getOAuthConnectionAccessTokenWithThrow({
    logger,
    provider: "intercom",
    connectionId,
  });
  return token.access_token;
}
