import { cacheWithRedis } from "@dust-tt/types";
import { Nango } from "@nangohq/node";
import axios from "axios";

import {
  DustConnectorWorkflowError,
  ExternalOAuthTokenError,
  NANGO_ERROR_TYPES,
  NangoError,
} from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import type { NangoConnectionId } from "@connectors/types/nango_connection_id";

const { NANGO_SECRET_KEY } = process.env;

class CustomNango extends Nango {
  async getConnection(
    providerConfigKey: string,
    connectionId: string,
    refreshToken?: boolean
  ) {
    try {
      return await super.getConnection(
        providerConfigKey,
        connectionId,
        true,
        refreshToken
      );
    } catch (e) {
      if (axios.isAxiosError(e)) {
        if (e.response?.status === 400) {
          if (typeof e?.response?.data?.error === "string") {
            const errorText = e.response.data.error;
            if (
              errorText.includes(
                "The external API returned an error when trying to refresh the access token"
              ) &&
              errorText.includes("invalid_grant")
            ) {
              throw new ExternalOAuthTokenError();
            }
            const errorType = e.response.data.type;
            if (NANGO_ERROR_TYPES.includes(errorType)) {
              throw new NangoError(errorType, e);
            }
          }
        }
        if (e.status === 520 && e.code === "ERR_BAD_RESPONSE") {
          throw new DustConnectorWorkflowError(
            "Nango transient 520 errors",
            "transient_nango_activity_error"
          );
        }
      }
      throw e;
    }
  }
}

function nango_client() {
  if (!NANGO_SECRET_KEY) {
    throw new Error("Env var NANGO_SECRET_KEY is not defined");
  }
  const nango = new CustomNango({ secretKey: NANGO_SECRET_KEY });

  return nango;
}

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
      workspace_id?: string;
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
