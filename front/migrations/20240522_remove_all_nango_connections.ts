import { Nango } from "@nangohq/node";

import { makeScript } from "@app/scripts/helpers";

const { NANGO_SECRET_KEY } = process.env;

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

makeScript({}, async ({ execute }) => {
  if (!NANGO_SECRET_KEY) {
    throw new Error("Env var NANGO_SECRET_KEY is not defined");
  }

  const nango = new Nango({ secretKey: NANGO_SECRET_KEY });
  const nangoConnections = await nango.listConnections();

  for (const connection of nangoConnections.connections) {
    console.log(`Deleting connection ${connection.id}`);
    if (execute) {
      await nangoDeleteConnection(connection.id, "TODO");
    }
  }
});
