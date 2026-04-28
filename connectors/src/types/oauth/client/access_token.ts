import type { LoggerInterface, Result } from "@dust-tt/client";
import { Ok } from "@dust-tt/client";
import throttle from "lodash/throttle";
import type { OAuthConnectionType, OAuthProvider } from "../../oauth/lib";
import type { OAuthAPIError } from "../../oauth/oauth_api";
import { OAuthAPI } from "../../oauth/oauth_api";

const OAUTH_ACCESS_TOKEN_CACHE_TTL = 1000 * 60 * 5;
const CACHE_CLEAR_INTERVAL = 1000 * 60;
// Mirror the OAuth server's refresh buffer so we never serve a token the server would already refresh.
const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 1000 * 60 * 8;

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
  throttle(clearExpiredEntries, CACHE_CLEAR_INTERVAL);

  const cached = CACHE.get(connectionId);

  if (cached && cached.local_expiry > Date.now()) {
    const isValid =
      cached.access_token_expiry === null ||
      cached.access_token_expiry > Date.now() + ACCESS_TOKEN_EXPIRY_BUFFER_MS;

    if (isValid) {
      return new Ok(cached);
    }

    logger.warn({ connectionId, provider }, "Local cache has expired tokens");
  }

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

function clearExpiredEntries() {
  const nowMs = Date.now();
  for (const [key, entry] of CACHE.entries()) {
    if (entry.local_expiry < nowMs) {
      CACHE.delete(key);
    }
  }
}
