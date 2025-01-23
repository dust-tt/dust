import { makeScript } from "scripts/helpers";

import { launchZendeskSyncWorkflow } from "@connectors/connectors/zendesk/temporal/client";
import type Logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskBrandResource,
  ZendeskCategoryResource,
} from "@connectors/resources/zendesk_resources";

async function migrateConnector(
  connector: ConnectorResource,
  execute: boolean,
  parentLogger: typeof Logger
) {
  const logger = parentLogger.child({ connectorId: connector.id });

  const helpCenterBrandIds =
    await ZendeskBrandResource.fetchHelpCenterReadAllowedBrandIds(connector.id);

  const allCategoryIds =
    await ZendeskCategoryResource.fetchByConnector(connector);
  const categoryIds = allCategoryIds
    .filter(
      (c) => c.permission === "read" && !helpCenterBrandIds.includes(c.brandId) // skipping categories that will be synced through the Help Center
    )
    .map((c) => {
      const { categoryId, brandId } = c;
      return { brandId, categoryId };
    });

  if (execute) {
    const res = await launchZendeskSyncWorkflow(connector, {
      helpCenterBrandIds,
      categoryIds,
    });
    if (res.isErr()) {
      logger.error({ error: res.error }, "ERR");
    } else {
      logger.info({ categoryIds, helpCenterBrandIds }, "LIVE");
    }
  } else {
    logger.info({ categoryIds, helpCenterBrandIds }, "DRY");
  }
}
makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("zendesk", {});
  logger.info(`Found ${connectors.length} Zendesk connectors`);

  for (const connector of connectors) {
    await migrateConnector(connector, execute, logger);
  }
});
