import { Nango } from "@nangohq/node";
import axios from "axios";

import { ExternalOauthTokenError } from "@connectors/lib/error";

import { Err, Ok, Result } from "./result";

const { NANGO_SECRET_KEY } = process.env;

class CustomNango extends Nango {
  async getConnection(
    providerConfigKey: string,
    connectionId: string,
    forceRefresh?: boolean,
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
          }
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
    if (res) {
      return new Err(
        new Error(
          `Could not delete connection. ${res.statusText}, ${await res.text()}`
        )
      );
    } else {
      return new Err(new Error(`Could not delete connection.`));
    }
  }
}
