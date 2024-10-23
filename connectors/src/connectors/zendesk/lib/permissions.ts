import type { ContentNode, ModelId } from "@dust-tt/types";

import {
  getBrandInternalId,
  getCategoryInternalId,
  getHelpCenterInternalId,
  getTicketsInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskBrandResource,
  ZendeskCategoryResource,
} from "@connectors/resources/zendesk_resources";

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

  const brands = await ZendeskBrandResource.fetchAllReadOnly({ connectorId });
  const brandNodes: ContentNode[] = brands.map((brand) => {
    return {
      provider: connector.type,
      internalId: getBrandInternalId(connectorId, brand.brandId),
      parentInternalId: null,
      type: "folder",
      title: brand.name,
      sourceUrl: brand.url,
      expandable: true,
      permission:
        brand.helpCenterPermission === "read" &&
        brand.ticketsPermission === "read"
          ? "read"
          : "none",
      dustDocumentId: null,
      lastUpdatedAt: brand.updatedAt.getTime() ?? null,
    };
  });

  const helpCenterNodes: ContentNode[] = brands
    .filter((brand) => brand.hasHelpCenter)
    .map((brand) => ({
      provider: connector.type,
      internalId: getHelpCenterInternalId(connectorId, brand.id),
      parentInternalId: getBrandInternalId(connectorId, brand.brandId),
      type: "database",
      title: "Help Center",
      sourceUrl: null,
      expandable: true,
      permission: brand.helpCenterPermission,
      dustDocumentId: null,
      lastUpdatedAt: brand.updatedAt.getTime(),
    }));

  const categories = await ZendeskCategoryResource.fetchAllReadOnly({
    connectorId,
  });
  const categoriesNodes: ContentNode[] = categories.map((category) => {
    return {
      provider: connector.type,
      internalId: getCategoryInternalId(connectorId, category.categoryId),
      parentInternalId: getHelpCenterInternalId(connectorId, category.brandId),
      type: "folder",
      title: category.name,
      sourceUrl: category.url,
      expandable: false,
      permission: category.permission,
      dustDocumentId: null,
      lastUpdatedAt: category.updatedAt.getTime() || null,
    };
  });

  const ticketNodes: ContentNode[] = brands.map((brand) => ({
    provider: connector.type,
    internalId: getTicketsInternalId(connectorId, brand.id),
    parentInternalId: getBrandInternalId(connectorId, brand.brandId),
    type: "database",
    title: "Tickets",
    sourceUrl: null,
    expandable: true,
    permission: brand.ticketsPermission,
    dustDocumentId: null,
    lastUpdatedAt: brand.updatedAt.getTime(),
  }));

  return [
    ...brandNodes,
    ...helpCenterNodes,
    ...categoriesNodes,
    ...ticketNodes,
  ];
}
