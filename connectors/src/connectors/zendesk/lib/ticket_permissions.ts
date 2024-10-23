import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  ModelId,
} from "@dust-tt/types";

import {
  getBrandInternalId,
  getTicketsInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { getZendeskAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import { createZendeskClient } from "@connectors/connectors/zendesk/lib/zendesk_api";
import { ZendeskBrand } from "@connectors/lib/models/zendesk";
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

  // At the root level, we show two nodes: Help Center and Tickets.
  if (isRootLevel) {
    const ticketsNode: ContentNode = {
      provider: connector.type,
      internalId: getTicketsInternalId(connectorId),
      parentInternalId: null,
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

  const token = await getZendeskAccessToken(connector.connectionId);
  const zendeskApiClient = createZendeskClient({ token });

  const isReadPermissionsOnly = filterPermission === "read";
  let nodes: ContentNode[] = [];

  // If the parent is the Tickets node, we retrieve the list of Brands.
  // If isReadPermissionsOnly = true, we retrieve the list of Brands from the DB that have permission == "read"
  // If isReadPermissionsOnly = false, we retrieve the list of Brands from Zendesk
  if (parentInternalId === getTicketsInternalId(connectorId)) {
    if (isReadPermissionsOnly) {
      const brandsInDatabase = await ZendeskBrand.findAll({
        where: {
          connectorId: connectorId,
          permission: "read",
        },
      });
      nodes = brandsInDatabase.map((brand) => ({
        provider: connector.type,
        internalId: getBrandInternalId(connectorId, brand.brandId),
        parentInternalId: getTicketsInternalId(connectorId),
        type: "folder",
        title: brand.name,
        sourceUrl: brand.url,
        expandable: false,
        permission: brand.permission,
        dustDocumentId: null,
        lastUpdatedAt: brand.updatedAt.getTime(),
      }));
    } else {
      const { result: brands } = await zendeskApiClient.brand.list();
      nodes = brands.map((brand) => ({
        provider: connector.type,
        internalId: getBrandInternalId(connectorId, brand.id),
        parentInternalId: getTicketsInternalId(connectorId),
        type: "folder",
        title: brand.name || "Brand",
        sourceUrl: brand.brand_url,
        expandable: false,
        permission: "none",
        dustDocumentId: null,
        lastUpdatedAt: null,
      }));
    }
  }

  nodes.sort((a, b) => a.title.localeCompare(b.title));
  return nodes;
}
