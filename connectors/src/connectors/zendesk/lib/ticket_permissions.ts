import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  ModelId,
} from "@dust-tt/types";

import {
  getBrandIdFromInternalId,
  getBrandIdFromTicketsId,
  getTicketInternalId,
  getTicketsInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";

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
  if (isRootLevel) {
    return [];
  }
  let brandId = getBrandIdFromInternalId(connectorId, parentInternalId);
  // If the parent is a Brand, we return a single node for its help center.
  if (brandId) {
    const ticketsNode: ContentNode = {
      provider: connector.type,
      internalId: getTicketsInternalId(connectorId, brandId),
      parentInternalId: parentInternalId,
      type: "database",
      title: "Tickets",
      sourceUrl: null,
      expandable: false,
      permission: "none",
      dustDocumentId: null,
      lastUpdatedAt: null,
    };

    return [ticketsNode];
  }

  // If the parent is a brand's tickets, we retrieve the list of tickets for the brand.
  // In read-only mode, we retrieve the list of Tickets from the DB that have permission == "read"
  // Otherwise, we do not show anything.
  brandId = getBrandIdFromTicketsId(connectorId, parentInternalId);
  if (brandId && filterPermission === "read") {
    const ticketsInDatabase = await ZendeskBrandResource.fetchReadOnlyTickets({
      connectorId,
      brandId,
    });
    const nodes: ContentNode[] = ticketsInDatabase.map((ticket) => ({
      provider: connector.type,
      internalId: getTicketInternalId(connectorId, ticket.ticketId),
      parentInternalId: parentInternalId,
      type: "file",
      title: ticket.name,
      sourceUrl: ticket.url,
      expandable: false,
      permission: ticket.permission,
      dustDocumentId: null,
      lastUpdatedAt: ticket.updatedAt.getTime(),
    }));
    nodes.sort((a, b) => a.title.localeCompare(b.title));
    return nodes;
  }
  return [];
}
