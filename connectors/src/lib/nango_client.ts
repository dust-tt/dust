import { Nango } from "@nangohq/node";

import { Err, Ok, Result } from "./result";

const { NANGO_SECRET_KEY } = process.env;

export function nango_client(): Nango {
  if (!NANGO_SECRET_KEY) {
    throw new Error("Env var NANGO_SECRET_KEY is not defined");
  }
  const nango = new Nango({ secretKey: NANGO_SECRET_KEY });

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
