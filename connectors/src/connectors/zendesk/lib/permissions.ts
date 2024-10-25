import type { ContentNode, ModelId } from "@dust-tt/types";

import { getBrandInternalId } from "@connectors/connectors/zendesk/lib/id_conversions";
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
    .map((brand) => brand.getHelpCenterContentNode({ connectorId }));

  const categories = await ZendeskCategoryResource.fetchAllReadOnly({
    connectorId,
  });
  const categoriesNodes: ContentNode[] = categories.map((category) =>
    category.toContentNode({ connectorId })
  );
  const ticketNodes: ContentNode[] = brands.map((brand) =>
    brand.getTicketsContentNode({ connectorId })
  );

  return [
    ...brandNodes,
    ...helpCenterNodes,
    ...categoriesNodes,
    ...ticketNodes,
  ];
}
