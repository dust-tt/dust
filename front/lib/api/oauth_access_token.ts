import type { OAuthConnectionType } from "@app/types/oauth/lib";
import type { OAuthAPIError } from "@app/types/oauth/oauth_api";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { LoggerInterface } from "@app/types/shared/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

const OAUTH_ACCESS_TOKEN_CACHE_TTL_MS = 1000 * 60 * 5;

const CACHE = new Map<
  string,
  {
    connection: OAuthConnectionType;
    access_token: string;
    access_token_expiry: number | null;
    scrubbed_raw_json: unknown;
    localExpiryMs: number;
  }
>();

export function invalidateOAuthConnectionAccessTokenCache(
  connectionId: string
): void {
  CACHE.delete(connectionId);
}

export async function getOAuthConnectionAccessToken({
  config,
  logger,
  connectionId,
}: {
  config: { url: string; apiKey: string | null };
  logger: LoggerInterface;
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

  if (cached && cached.localExpiryMs > Date.now()) {
    return new Ok(cached);
  }

  const res = await new OAuthAPI(config, logger).getAccessToken({
    connectionId,
  });

  if (res.isErr()) {
    return res;
  }

  CACHE.set(connectionId, {
    localExpiryMs: Date.now() + OAUTH_ACCESS_TOKEN_CACHE_TTL_MS,
    ...res.value,
  });

  return res;
}
