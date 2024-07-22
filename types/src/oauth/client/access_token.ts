import { OAuthConnectionType, OAuthProvider } from "../../oauth/lib";
import { OAuthAPI, OAuthAPIError } from "../../oauth/oauth_api";
import { LoggerInterface } from "../../shared/logger";
import { Ok, Result } from "../../shared/result";

const OAUTH_ACCESS_TOKEN_CACHE_TTL = 1000 * 60 * 5;

const CACHE = new Map<
  string,
  {
    connection: OAuthConnectionType;
    access_token: string;
    access_token_expiry: number | null;
    scrubbed_raw_json: unknown;
    local_expiry: number;
  }
>();

export async function getOAuthConnectionAccessToken({
  config,
  logger,
  provider,
  connectionId,
}: {
  config: { url: string; apiKey: string | null };
  logger: LoggerInterface;
  provider: OAuthProvider;
  connectionId: string;
}): Promise<
  Result<
    {
      connection: OAuthConnectionType;
      access_token: string;
      access_token_expiry: number | null;
      scrubbed_raw_json: unknown;
    },
    OAuthAPIError
  >
> {
  const cached = CACHE.get(connectionId);

  if (cached && cached.local_expiry > Date.now()) {
    logger.info(
      {
        provider,
        connectionId,
      },
      "Access token cache hit"
    );
    return new Ok(cached);
  }
  logger.info(
    {
      cached: !!cached,
      provider,
      connectionId,
    },
    "Access token cache miss"
  );

  const res = await new OAuthAPI(config, logger).getAccessToken({
    provider,
    connectionId,
  });

  if (res.isErr()) {
    return res;
  }

  CACHE.set(connectionId, {
    local_expiry: Date.now() + OAUTH_ACCESS_TOKEN_CACHE_TTL,
    ...res.value,
  });

  return res;
}
