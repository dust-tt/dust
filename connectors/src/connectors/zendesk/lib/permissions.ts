import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  ModelId,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";

import {
  getBrandInternalId,
  getCategoryInternalId,
  getHelpCenterInternalId,
  getIdFromInternalId,
  getTicketsInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  changeZendeskClientSubdomain,
  createZendeskClient,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskArticleResource,
  ZendeskBrandResource,
  ZendeskCategoryResource,
  ZendeskTicketResource,
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

export async function retrieveChildrenNodes({
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

  const isReadPermissionsOnly = filterPermission === "read";
  let nodes: ContentNode[] = [];

  const { accessToken, subdomain } = await getZendeskSubdomainAndAccessToken(
    connector.connectionId
  );
  const zendeskApiClient = createZendeskClient({
    token: accessToken,
    subdomain,
  });

  // At the root level, we show one node for each brand.
  if (!parentInternalId) {
    if (isReadPermissionsOnly) {
      const brandsInDatabase =
        await ZendeskBrandResource.fetchAllWithHelpCenter({ connectorId });
      nodes = brandsInDatabase.map((brand) =>
        brand.toContentNode({ connectorId })
      );
    } else {
      const { result: brands } = await zendeskApiClient.brand.list();
      nodes = brands
        .filter((brand) => brand.has_help_center)
        .map((brand) => ({
          provider: connector.type,
          internalId: getBrandInternalId(connectorId, brand.id),
          parentInternalId: null,
          type: "folder",
          title: brand.name || "Brand",
          sourceUrl: brand.brand_url,
          expandable: true,
          permission: "none",
          dustDocumentId: null,
          lastUpdatedAt: null,
        }));
    }
  } else {
    const { type, objectId } = getIdFromInternalId(
      connectorId,
      parentInternalId
    );
    switch (type) {
      // If the parent is a Brand, we return a node for its tickets and one for its help center.
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
        nodes.push(ticketsNode);

        let hasHelpCenter = false;
        if (isReadPermissionsOnly) {
          const brandInDatabase = await ZendeskBrandResource.fetchByBrandId({
            connectorId,
            brandId: objectId,
          });
          hasHelpCenter =
            brandInDatabase !== null && brandInDatabase.hasHelpCenter;
        } else {
          const fetchedBrand = await zendeskApiClient.brand.show(objectId);
          hasHelpCenter = fetchedBrand.result.brand.has_help_center;
        }
        if (hasHelpCenter) {
          const helpCenterNode: ContentNode = {
            provider: connector.type,
            internalId: getHelpCenterInternalId(connectorId, objectId),
            parentInternalId: parentInternalId,
            type: "folder",
            title: "Help Center",
            sourceUrl: null,
            expandable: true,
            permission: "none",
            dustDocumentId: null,
            lastUpdatedAt: null,
          };
          nodes.push(helpCenterNode);
        }
        break;
      }
      // If the parent is a brand's tickets, we retrieve the list of tickets for the brand.
      case "tickets": {
        if (isReadPermissionsOnly) {
          const ticketsInDb =
            await ZendeskTicketResource.fetchByBrandIdReadOnly({
              connectorId,
              brandId: objectId,
            });
          nodes = ticketsInDb.map((ticket) =>
            ticket.toContentNode({ connectorId })
          );
        }
        break;
      }
      // If the parent is a brand's help center, we retrieve the list of Categories for this brand.
      case "help-center": {
        const categoriesInDatabase =
          await ZendeskCategoryResource.fetchByBrandIdReadOnly({
            connectorId,
            brandId: objectId,
          });
        if (isReadPermissionsOnly) {
          nodes = categoriesInDatabase.map((category) =>
            category.toContentNode({ connectorId })
          );
        } else {
          await changeZendeskClientSubdomain({
            client: zendeskApiClient,
            brandId: objectId,
          });
          const categories =
            await zendeskApiClient.helpcenter.categories.list();
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
        break;
      }
      // If the parent is a category, we retrieve the list of articles for this category.
      case "category": {
        if (isReadPermissionsOnly) {
          const articlesInDb =
            await ZendeskArticleResource.fetchByCategoryIdReadOnly({
              connectorId,
              categoryId: objectId,
            });
          nodes = articlesInDb.map((article) =>
            article.toContentNode({ connectorId })
          );
        }
        break;
      }
      // Single tickets and articles have no children.
      case "ticket":
      case "article":
        return [];
      default:
        assertNever(type);
    }
  }

  nodes.sort((a, b) => a.title.localeCompare(b.title));
  return nodes;
}
