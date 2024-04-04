
import type { NangoConnectionId, NangoConnectionResponse } from './types';


// NANGO 

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

export async function getConnectionFromNango({
  connectionId,
  integrationId,
  refreshToken = false
}: {
  connectionId: NangoConnectionId;
  integrationId: string;
  refreshToken?: boolean;
  useCache?: boolean;
}): Promise<NangoConnectionResponse> {
  return _getConnectionFromNango({
    connectionId,
    integrationId,
    refreshToken,
  });
}

