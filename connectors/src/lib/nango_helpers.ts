import { cacheWithRedis } from "@dust-tt/types";

import { NangoConnectionId } from "@connectors/types/nango_connection_id";

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

export const getAccessTokenFromNango = cacheWithRedis(
  _getAccessTokenFromNango,
  ({ connectionId, integrationId }) => {
    return `${integrationId}-${connectionId}`;
  },
  NANGO_ACCESS_TOKEN_TTL_SECONDS * 1000
);

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

export const getConnectionFromNango = cacheWithRedis(
  _getConnectionFromNango,
  ({ connectionId, integrationId, refreshToken }) => {
    return `${integrationId}-${connectionId}-${refreshToken}`;
  },
  NANGO_ACCESS_TOKEN_TTL_SECONDS * 1000
);
