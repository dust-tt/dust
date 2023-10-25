import { redisClient } from "@connectors/lib/redis";
import { NangoConnectionId } from "@connectors/types/nango_connection_id";

import { nango_client } from "./nango_client";

const NANGO_ACCESS_TOKEN_TTL_SECONDS = 60 * 5; // 5 minutes

export async function getAccessTokenFromNango({
  connectionId,
  integrationId,
  useCache = false,
}: {
  connectionId: NangoConnectionId;
  integrationId: string;
  useCache?: boolean;
}) {
  const cacheKey = `nango_access_token:${integrationId}/${connectionId}`;
  const redis = await redisClient();

  try {
    const _setCache = (token: string) =>
      redis.set(cacheKey, token, {
        EX: NANGO_ACCESS_TOKEN_TTL_SECONDS,
      });

    if (!useCache) {
      const accessToken = await _getAccessTokenFromNango({
        connectionId,
        integrationId,
      });
      await _setCache(accessToken);
      return accessToken;
    }

    const maybeAccessToken = await redis.get(cacheKey);
    if (maybeAccessToken) {
      return maybeAccessToken;
    }
    const accessToken = await nango_client().getToken(
      integrationId,
      connectionId
    );
    await _setCache(accessToken);
    return accessToken;
  } finally {
    redis.quit();
  }
}

async function _getAccessTokenFromNango({
  connectionId,
  integrationId,
}: {
  connectionId: NangoConnectionId;
  integrationId: string;
}) {
  const accessToken = await nango_client().getToken(
    integrationId,
    connectionId
  );
  return accessToken;
}
