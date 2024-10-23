import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  ModelId,
} from "@dust-tt/types";

import {
  getBrandIdFromHelpCenterId,
  getBrandIdFromInternalId,
  getCategoryInternalId,
  getHelpCenterInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { getZendeskAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  changeZendeskClientSubdomain,
  createZendeskClient,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import { ZendeskBrand, ZendeskCategory } from "@connectors/lib/models/zendesk";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export async function retrieveZendeskHelpCenterPermissions({
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

  const token = await getZendeskAccessToken(connector.connectionId);
  const zendeskApiClient = createZendeskClient({ token });

  const isReadPermissionsOnly = filterPermission === "read";
  const isRootLevel = !parentInternalId;
  let nodes: ContentNode[] = [];

  // There is no help center at the root level.
  if (!isRootLevel) {
    let brandId = getBrandIdFromInternalId(connectorId, parentInternalId);
    // If the parent is a Brand, we return a single node for its help center.
    if (brandId) {
      const brandInDatabase = await ZendeskBrand.findOne({
        where: { connectorId, brandId },
      });
      if (brandInDatabase?.hasHelpCenter) {
        const helpCenterNode: ContentNode = {
          provider: connector.type,
          internalId: getHelpCenterInternalId(connectorId, brandId),
          parentInternalId: parentInternalId,
          type: "database",
          title: "Help Center",
          sourceUrl: null,
          expandable: true,
          permission: "none",
          dustDocumentId: null,
          lastUpdatedAt: null,
        };
        return [helpCenterNode];
      }
    }
    brandId = getBrandIdFromHelpCenterId(connectorId, parentInternalId);
    // If the parent is a brand's help center, we retrieve the list of Categories for this brand.
    // If isReadPermissionsOnly = true, we retrieve the list of Categories from the DB that have permission == "read"
    // If isReadPermissionsOnly = false, we retrieve the list of Categories from Zendesk
    if (brandId) {
      const categoriesInDatabase = await ZendeskCategory.findAll({
        where: { connectorId, brandId, permission: "read" },
      });
      if (isReadPermissionsOnly) {
        nodes = categoriesInDatabase.map((category) => ({
          provider: connector.type,
          internalId: getCategoryInternalId(connectorId, category.categoryId),
          parentInternalId: parentInternalId,
          type: "folder",
          title: category.name,
          sourceUrl: category.url,
          expandable: false,
          permission: category.permission,
          dustDocumentId: null,
          lastUpdatedAt: category.updatedAt.getTime(),
        }));
      } else {
        await changeZendeskClientSubdomain({
          client: zendeskApiClient,
          brandId,
        });
        const categories = await zendeskApiClient.helpcenter.categories.list();
        nodes = categories.map((category) => {
          const matchingDbEntry = categoriesInDatabase.find(
            (c) => c.categoryId === category.id
          );
          return {
            provider: connector.type,
            internalId: getCategoryInternalId(connectorId, category.id),
            parentInternalId: parentInternalId,
            type: "folder",
            title: category.name,
            sourceUrl: category.html_url,

            expandable: false,
            permission: matchingDbEntry ? "read" : "none",
            dustDocumentId: null,
            lastUpdatedAt: matchingDbEntry?.updatedAt.getTime() ?? null,
          };
        });
      }
    }
  }
  nodes.sort((a, b) => a.title.localeCompare(b.title));
  return nodes;
}
