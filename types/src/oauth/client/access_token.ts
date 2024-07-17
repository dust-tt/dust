import { OAuthConnectionType, OAuthProvider } from "../../oauth/lib";
import { OAuthAPI, OAuthAPIError } from "../../oauth/oauth_api";
import { LoggerInterface } from "../../shared/logger";
import { Ok, Result } from "../../shared/result";

const CACHE = new Map<
  string,
  {
    connection: OAuthConnectionType;
    access_token: string;
    access_token_expiry: number;
  }
>();

export async function getOAuthConnectionAccessToken({
  config,
  logger,
  provider,
  connectionId,
}: {
  config: { url: string };
  logger: LoggerInterface;
  provider: OAuthProvider;
  connectionId: string;
}): Promise<
  Result<
    {
      connection: OAuthConnectionType;
      access_token: string;
      access_token_expiry: number;
    },
    OAuthAPIError
  >
> {
  const cached = CACHE.get(connectionId);

  if (cached && cached.access_token_expiry < Date.now()) {
    return new Ok(cached);
  }

  const res = await new OAuthAPI(config, logger).getAccessToken({
    provider,
    connectionId,
  });

  if (res.isErr()) {
    return res;
  }
  CACHE.set(connectionId, res.value);

  return res;
}
