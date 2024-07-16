import { cacheWithRedis } from "@dust-tt/types";

import logger from "@connectors/logger/logger";
import type { NangoConnectionId } from "@connectors/types/nango_connection_id";

import { nango_client } from "./nango_client";

const NANGO_ACCESS_TOKEN_TTL_SECONDS = 60 * 5; // 5 minutes

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

const _cachedGetAccessTokenFromNango = cacheWithRedis(
  _getAccessTokenFromNango,
  ({ connectionId, integrationId }) => {
    return `${integrationId}-${connectionId}`;
  },
  NANGO_ACCESS_TOKEN_TTL_SECONDS * 1000
);

export async function getAccessTokenFromNango({
  connectionId,
  integrationId,
  useCache = false,
}: {
  connectionId: NangoConnectionId;
  integrationId: string;
  useCache?: boolean;
}) {
  if (useCache) {
    return _cachedGetAccessTokenFromNango({
      connectionId,
      integrationId,
    });
  } else {
    return _getAccessTokenFromNango({ connectionId, integrationId });
  }
}

async function _getConnectionFromNango({
  connectionId,
  integrationId,
  refreshToken,
}: {
  connectionId: NangoConnectionId;
  integrationId: string;
  refreshToken?: boolean;
}) {
  const accessToken = await nango_client().getConnection(
    integrationId,
    connectionId,
    refreshToken
  );
  return accessToken;
}

const _getCachedConnectionFromNango = cacheWithRedis(
  _getConnectionFromNango,
  ({ connectionId, integrationId, refreshToken }) => {
    return `${integrationId}-${connectionId}-${refreshToken}`;
  },
  NANGO_ACCESS_TOKEN_TTL_SECONDS * 1000
);

export type NangoConnectionResponse = {
  connection_id: string;
  credentials: {
    type: string;
    access_token: string;
    refresh_token: string;
    expires_at: string;
    expires_in: number;
    raw: {
      scope: string;
      token_type: string;
    };
  };
};

export async function getConnectionFromNango({
  connectionId,
  integrationId,
  refreshToken = false,
  useCache = false,
}: {
  connectionId: NangoConnectionId;
  integrationId: string;
  refreshToken?: boolean;
  useCache?: boolean;
}): Promise<NangoConnectionResponse> {
  try {
    if (useCache) {
      return await _getCachedConnectionFromNango({
        connectionId,
        integrationId,
        refreshToken,
      });
    } else {
      return await _getConnectionFromNango({
        connectionId,
        integrationId,
        refreshToken,
      });
    }
  } catch (error) {
    logger.error(
      { connectionId, integrationId, error },
      "Error while getting connection from Nango"
    );

    throw error;
  }
}
