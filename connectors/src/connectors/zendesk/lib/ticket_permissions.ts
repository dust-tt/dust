import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  ModelId,
} from "@dust-tt/types";

import {
  getBrandIdFromInternalId,
  getTicketsInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export async function retrieveZendeskTicketPermissions({
  connectorId,
  parentInternalId,
  filterPermission,
}: {
  connectorId: ModelId;
  parentInternalId: string | null;
  filterPermission: ConnectorPermission | null;
  viewType: ContentNodesViewType;
}): Promise<ContentNode[]> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "[Zendesk] Connector not found.");
    throw new Error("Connector not found");
  }

  const isRootLevel = !parentInternalId;

  // There is no ticket at the root level, only the brands.
  if (!isRootLevel) {
    const brandId = getBrandIdFromInternalId(connectorId, parentInternalId);
    // If the parent is a Brand, we return a single node for its help center.
    if (brandId) {
      const ticketsNode: ContentNode = {
        provider: connector.type,
        internalId: getTicketsInternalId(connectorId),
        parentInternalId: parentInternalId,
        type: "database",
        title: "Tickets",
        sourceUrl: null,
        expandable: true,
        permission: "none",
        dustDocumentId: null,
        lastUpdatedAt: null,
      };

      return [ticketsNode];
    }
  }
  return [];
}
