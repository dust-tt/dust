import { makeScript } from "scripts/helpers";

import { getBrandInternalId } from "@connectors/connectors/zendesk/lib/id_conversions";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  deleteDataSourceFolder,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import type Logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskBrandResource,
  ZendeskCategoryResource,
} from "@connectors/resources/zendesk_resources";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

const FOLDER_CONCURRENCY = 10;

async function migrateConnector(
  connector: ConnectorResource,
  execute: boolean,
  logger: typeof Logger
) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const connectorId = connector.id;

  const brands = await ZendeskBrandResource.fetchByConnector(connector);
  if (execute) {
    await concurrentExecutor(
      brands,
      async (brand) => {
        /// same code as in the connector
        const brandInternalId = getBrandInternalId({
          connectorId,
          brandId: brand.brandId,
        });
        // deleting the brand folder
        await deleteDataSourceFolder({
          dataSourceConfig,
          folderId: brandInternalId,
        });

        // upserting the folders for HC and T to update their parents
        const helpCenterNode = brand.getHelpCenterContentNode(connectorId, {
          richTitle: true,
        });
        await upsertDataSourceFolder({
          dataSourceConfig,
          folderId: helpCenterNode.internalId,
          parents: [helpCenterNode.internalId],
          parentId: null,
          title: helpCenterNode.title,
          mimeType: INTERNAL_MIME_TYPES.ZENDESK.HELP_CENTER,
        });

        const ticketsNode = brand.getTicketsContentNode(connectorId, {
          richTitle: true,
        });
        await upsertDataSourceFolder({
          dataSourceConfig,
          folderId: ticketsNode.internalId,
          parents: [ticketsNode.internalId],
          parentId: null,
          title: ticketsNode.title,
          mimeType: INTERNAL_MIME_TYPES.ZENDESK.TICKETS,
        });
      },
      { concurrency: FOLDER_CONCURRENCY }
    );
    logger.info(
      `Updated ${brands.length} brands for connector ${connector.id}`
    );
  } else {
    logger.info(`Found ${brands.length} brands for connector ${connector.id}`);
  }

  // upserting the folders for categories to update their parents
  const categories = await ZendeskCategoryResource.fetchByConnector(connector);
  if (execute) {
    await concurrentExecutor(
      categories,
      async (category) => {
        /// same code as in the connector
        const parents = category.getParentInternalIds(connectorId);
        await upsertDataSourceFolder({
          dataSourceConfig: dataSourceConfigFromConnector(connector),
          folderId: parents[0],
          parents,
          parentId: parents[1],
          title: category.name,
          mimeType: INTERNAL_MIME_TYPES.ZENDESK.CATEGORY,
        });
      },
      { concurrency: FOLDER_CONCURRENCY }
    );
    logger.info(
      `Updated ${brands.length} categories for connector ${connector.id}`
    );
  } else {
    logger.info(
      `Found ${brands.length} categories for connector ${connector.id}`
    );
  }
}
makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("zendesk", {});

  for (const connector of connectors) {
    await migrateConnector(
      connector,
      execute,
      logger.child({ connectorId: connector.id })
    );
  }
});
