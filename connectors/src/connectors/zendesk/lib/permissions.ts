import type { ContentNode, ModelId } from "@dust-tt/types";

import {
  getBrandInternalId,
  getCategoryInternalId,
  getHelpCenterInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { ZendeskBrand, ZendeskCategory } from "@connectors/lib/models/zendesk";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

/**
 * Retrieve all selected nodes by the admin when setting permissions.
 * For Zendesk, the admin can set:
 * - all the tickets/whole help center
 * - brands, categories within a help center
 * - brands' tickets
 */
export async function retrieveSelectedNodes({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<ContentNode[]> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "[Zendesk] Connector not found.");
    throw new Error("Connector not found");
  }

  const brands = await ZendeskBrand.findAll({
    where: { connectorId, permission: "read" },
  });
  const brandNodes: ContentNode[] = brands.map((brand) => {
    return {
      provider: connector.type,
      internalId: getBrandInternalId(connectorId, brand.brandId),
      parentInternalId: getHelpCenterInternalId(connectorId),
      type: "folder",
      title: brand.name,
      sourceUrl: brand.url,
      expandable: true,
      permission: brand.permission,
      dustDocumentId: null,
      lastUpdatedAt: brand.updatedAt.getTime() ?? null,
    };
  });

  const categories = await ZendeskCategory.findAll({
    where: { connectorId: connectorId, permission: "read" },
  });
  const categoriesNodes: ContentNode[] = categories.map((category) => {
    return {
      provider: connector.type,
      internalId: getCategoryInternalId(connectorId, category.categoryId),
      parentInternalId: getBrandInternalId(connectorId, category.brandId),
      type: "folder",
      title: category.name,
      sourceUrl: category.url,
      expandable: false,
      permission: category.permission,
      dustDocumentId: null,
      lastUpdatedAt: category.updatedAt.getTime() || null,
    };
  });

  return [...brandNodes, ...categoriesNodes];
}
