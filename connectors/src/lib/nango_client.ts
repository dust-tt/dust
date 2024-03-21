import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { Nango } from "@nangohq/node";
import axios from "axios";

import type { WorkflowError } from "@connectors/lib/error";
import {
  ExternalOauthTokenError,
  NANGO_ERROR_TYPES,
  NangoError,
} from "@connectors/lib/error";
import logger from "@connectors/logger/logger";

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
              throw new ExternalOauthTokenError();
            }
            const errorType = e.response.data.type;
            if (NANGO_ERROR_TYPES.includes(errorType)) {
              throw new NangoError(errorType, e);
            }
          }
        }
        if (e.status === 520 && e.code === "ERR_BAD_RESPONSE") {
          const workflowError: WorkflowError = {
            type: "transient_nango_activity_error",
            message: `Nango transient 520 errors`,
            __is_dust_error: true,
          };
          throw workflowError;
        }
      }
      throw e;
    }
  }
}

export function nango_client() {
  if (!NANGO_SECRET_KEY) {
    throw new Error("Env var NANGO_SECRET_KEY is not defined");
  }
  const nango = new CustomNango({ secretKey: NANGO_SECRET_KEY });

  return nango;
}

/**
 * The Nango SDK does not provide the method to delete a connection,
 * so here it is.
 * We rely on properties (serverUrl and secretKey) from the Nango client object.
 */
export async function nangoDeleteConnection(
  connectionId: string,
  providerConfigKey: string
): Promise<Result<undefined, Error>> {
  const nangoClient = nango_client();
  const url = `${nangoClient.serverUrl}/connection/${connectionId}?provider_config_key=${providerConfigKey}`;
  const headers = {
    "Content-Type": "application/json",
    "Accept-Encoding": "application/json",
    Authorization: `Bearer ${nangoClient.secretKey}`,
  };
  const res = await fetch(url, {
    method: "DELETE",
    headers,
  });
  if (res.ok) {
    return new Ok(undefined);
  } else {
    logger.error({ connectionId }, "Could not delete Nango connection.");
    if (res) {
      if (res.status === 404) {
        logger.error({ connectionId }, "Connection not found on Nango.");
        return new Ok(undefined);
      }

      return new Err(
        new Error(
          `Could not delete connection. ${res.statusText}, ${await res.text()}`
        )
      );
    }

    return new Err(new Error(`Could not delete connection.`));
  }
}
