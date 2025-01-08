import { makeScript } from "scripts/helpers";

import { RemoteTableModel } from "@connectors/lib/models/remote_databases";

makeScript({}, async ({ execute }, logger) => {
  logger.info("Resetting lastUpsertedAt on all snowflake tables.");

  if (!execute) {
    logger.info("Nothing to do in dry run, skipping.");
    return;
  }

  await RemoteTableModel.update(
    {
      lastUpsertedAt: null,
    },
    {
      // Do it for every single remote table.
      where: {},
    }
  );

  logger.info("Done.");
});
