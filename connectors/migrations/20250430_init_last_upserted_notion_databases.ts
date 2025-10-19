import { makeScript } from "scripts/helpers";

import { ConnectorResource } from "@connectors/resources/connector_resource";
import { connectorsSequelize } from "@connectors/resources/storage";

makeScript({}, async ({ execute }, logger) => {
  const notionConnectors = await ConnectorResource.listByType("notion", {});
  const localLogger = logger.child({
    provider: "notion",
    process: "init_last_upserted_notion_databases",
  });
  localLogger.info(
    { notionConnectors: notionConnectors.length },
    "Found notion connectors to backfill."
  );
  for (const c of notionConnectors) {
    localLogger.info({ connectorId: c.id }, "Backfilling connector.");
    // We initialize lastUpsertedRunTs to firstSeenTs (to allow prioritizing
    // databases that were never upserted yet).
    if (execute) {
      await connectorsSequelize.query(
        `UPDATE notion_databases SET "lastUpsertedRunTs" = "firstSeenTs" WHERE "connectorId" = :connectorId`,
        {
          replacements: { connectorId: c.id },
        }
      );
    }
  }
});
