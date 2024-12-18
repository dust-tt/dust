import { makeScript } from "scripts/helpers";

import { getBrandInternalId } from "@connectors/connectors/zendesk/lib/id_conversions";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskBrandResource,
  ZendeskCategoryResource,
} from "@connectors/resources/zendesk_resources";

const FOLDER_CONCURRENCY = 10;

makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("zendesk", {});

  for (const connector of connectors) {
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
          await upsertDataSourceFolder({
            dataSourceConfig,
            folderId: brandInternalId,
            parents: [brandInternalId],
            title: brand.name,
          });

          const helpCenterNode = brand.getHelpCenterContentNode(connectorId);
          await upsertDataSourceFolder({
            dataSourceConfig,
            folderId: helpCenterNode.internalId,
            parents: [
              helpCenterNode.internalId,
              helpCenterNode.parentInternalId,
            ],
            title: helpCenterNode.title,
          });

          const ticketsNode = brand.getTicketsContentNode(connectorId);
          await upsertDataSourceFolder({
            dataSourceConfig,
            folderId: ticketsNode.internalId,
            parents: [ticketsNode.internalId, ticketsNode.parentInternalId],
            title: ticketsNode.title,
          });
        },
        { concurrency: FOLDER_CONCURRENCY }
      );
      logger.info(
        `Upserted ${brands.length} spaces for connector ${connector.id}`
      );
    } else {
      logger.info(
        `Found ${brands.length} spaces for connector ${connector.id}`
      );
    }

    const categories =
      await ZendeskCategoryResource.fetchByConnector(connector);
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
            title: category.name,
          });
        },
        { concurrency: FOLDER_CONCURRENCY }
      );
      logger.info(
        `Upserted ${brands.length} spaces for connector ${connector.id}`
      );
    } else {
      logger.info(
        `Found ${brands.length} spaces for connector ${connector.id}`
      );
    }
  }
});
