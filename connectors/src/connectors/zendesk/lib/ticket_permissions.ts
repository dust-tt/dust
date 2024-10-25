import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  ModelId,
} from "@dust-tt/types";

import {
  getIdFromInternalId,
  getTicketInternalId,
  getTicketsInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { getZendeskAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import { createZendeskClient } from "@connectors/connectors/zendesk/lib/zendesk_api";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";

export async function allowSyncZendeskTickets({
  subdomain,
  connectorId,
  connectionId,
  brandId,
  withChildren = false,
}: {
  subdomain: string;
  connectorId: ModelId;
  connectionId: string;
  brandId: number;
  withChildren?: boolean;
}): Promise<ZendeskBrandResource | null> {
  let brand = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  if (brand?.ticketsPermission === "none") {
    await brand.update({ ticketsPermission: "read" });
  }

  const token = await getZendeskAccessToken(connectionId);
  const zendeskApiClient = createZendeskClient({ token, subdomain });

  if (!brand) {
    const {
      result: { brand: fetchedBrand },
    } = await zendeskApiClient.brand.show(brandId);
    if (fetchedBrand) {
      brand = await ZendeskBrandResource.makeNew({
        blob: {
          subdomain: fetchedBrand.subdomain,
          connectorId: connectorId,
          brandId: fetchedBrand.id,
          name: fetchedBrand.name || "Brand",
          helpCenterPermission: "none",
          ticketsPermission: "read",
          hasHelpCenter: fetchedBrand.has_help_center,
          url: fetchedBrand.url,
        },
      });
    } else {
      logger.error({ brandId }, "[Zendesk] Brand could not be fetched.");
      return null;
    }
  }

  if (withChildren) {
    throw new Error("withChildren not implemented yet.");
  }

  return brand;
}

/**
 * Mark a help center as permission "none" and all children (collections and articles).
 */
export async function revokeSyncZendeskTickets({
  connectorId,
  brandId,
}: {
  connectorId: ModelId;
  brandId: number;
}): Promise<ZendeskBrandResource | null> {
  const brand = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  if (!brand) {
    logger.error(
      { brandId },
      "[Zendesk] Brand not found, could not revoke sync."
    );
    return null;
  }

  await brand.revokeTicketsPermissions();
  return brand;
}

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
  const { type, objectId } = getIdFromInternalId(connectorId, parentInternalId);
  switch (type) {
    // If the parent is a Brand, we return a single node for its tickets.
    case "brand": {
      const ticketsNode: ContentNode = {
        provider: connector.type,
        internalId: getTicketsInternalId(connectorId, objectId),
        parentInternalId: parentInternalId,
        type: "folder",
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
    case "tickets": {
      if (filterPermission === "read") {
        const ticketsInDb = await ZendeskBrandResource.fetchReadOnlyTickets({
          connectorId,
          brandId: objectId,
        });
        const nodes: ContentNode[] = ticketsInDb.map((ticket) => ({
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
    // Help center and categories are handled in retrieveZendeskHelpCenterPermissions
    // Single tickets and articles have no children.
    case "help-center":
    case "category":
    case "ticket":
    case "article":
    case null:
      return [];
  }
}
