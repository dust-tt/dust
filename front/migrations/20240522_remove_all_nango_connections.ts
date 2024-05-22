import { Nango } from "@nangohq/node";

import { makeScript } from "@app/scripts/helpers";

const { NANGO_SECRET_KEY } = process.env;

makeScript({}, async ({ execute }) => {
  if (!NANGO_SECRET_KEY) {
    throw new Error("Env var NANGO_SECRET_KEY is not defined");
  }

  const nango = new Nango({ secretKey: NANGO_SECRET_KEY });
  const nangoConnections = await nango.listConnections();

  for (const connection of nangoConnections.connections) {
    console.log(`Deleting connection ${connection.id}`);
    if (execute) {
      // TODO revoke on each platform, do not delete from Nango
    }
  }
});
