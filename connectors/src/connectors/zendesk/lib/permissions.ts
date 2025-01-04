import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  ModelId,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { Client } from "node-zendesk";

import {
  getBrandInternalId,
  getCategoryInternalId,
  getHelpCenterInternalId,
  getIdsFromInternalId,
  getTicketsInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  changeZendeskClientSubdomain,
  createZendeskClient,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskArticleResource,
  ZendeskBrandResource,
  ZendeskCategoryResource,
  ZendeskTicketResource,
} from "@connectors/resources/zendesk_resources";

/**
 * Retrieve all nodes selected by the admin when setting permissions.
 */
export async function retrieveAllSelectedNodes(
  connectorId: ModelId
): Promise<ContentNode[]> {
  const brands = await ZendeskBrandResource.fetchAllReadOnly(connectorId);
  const helpCenterNodes: ContentNode[] = brands
    .filter(
      (brand) => brand.hasHelpCenter && brand.helpCenterPermission === "read"
    )
    .map((brand) =>
      brand.getHelpCenterContentNode(connectorId, { richTitle: true })
    );

  const ticketNodes: ContentNode[] = brands
    .filter((brand) => brand.ticketsPermission === "read")
    .map((brand) =>
      brand.getTicketsContentNode(connectorId, {
        expandable: true,
        richTitle: true,
      })
    );

  return [...helpCenterNodes, ...ticketNodes];
}

/**
 * Retrieves the Brand content nodes, which populate the root level.
 */
async function getRootLevelContentNodes(
  zendeskApiClient: Client,
  {
    connectorId,
    isReadPermissionsOnly,
  }: {
    connectorId: ModelId;
    isReadPermissionsOnly: boolean;
  }
): Promise<ContentNode[]> {
  const brandsInDatabase =
    await ZendeskBrandResource.fetchAllReadOnly(connectorId);
  if (isReadPermissionsOnly) {
    return brandsInDatabase.map((brand) => brand.toContentNode(connectorId));
  } else {
    const { result: brands } = await zendeskApiClient.brand.list();
    return brands.map(
      (brand) =>
        brandsInDatabase
          .find((b) => b.brandId === brand.id)
          ?.toContentNode(connectorId) ?? {
          provider: "zendesk",
          internalId: getBrandInternalId({ connectorId, brandId: brand.id }),
          parentInternalId: null,
          type: "folder",
          title: brand.name || "Brand",
          sourceUrl: brand.brand_url,
          expandable: true,
          permission: "none",
          dustDocumentId: null,
          lastUpdatedAt: null,
        }
    );
  }
}

/**
 * Retrieves the two children node of a Brand, one for its tickets and one for its help center.
 */
async function getBrandChildren(
  zendeskApiClient: Client,
  connector: ConnectorResource,
  {
    brandId,
    isReadPermissionsOnly,
    parentInternalId,
  }: {
    brandId: number;
    parentInternalId: string;
    isReadPermissionsOnly: boolean;
  }
): Promise<ContentNode[]> {
  const nodes = [];
  const brandInDb = await ZendeskBrandResource.fetchByBrandId({
    connectorId: connector.id,
    brandId,
  });
  if (isReadPermissionsOnly) {
    if (brandInDb?.ticketsPermission === "read") {
      nodes.push(
        brandInDb.getTicketsContentNode(connector.id, { expandable: true })
      );
    }
    if (
      brandInDb?.hasHelpCenter &&
      brandInDb?.helpCenterPermission === "read"
    ) {
      nodes.push(brandInDb.getHelpCenterContentNode(connector.id));
    }
  } else {
    const ticketsNode: ContentNode = brandInDb?.getTicketsContentNode(
      connector.id
    ) ?? {
      provider: "zendesk",
      internalId: getTicketsInternalId({ connectorId: connector.id, brandId }),
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

    const hasHelpCenter =
      brandInDb?.hasHelpCenter ||
      (await zendeskApiClient.brand.show(brandId)).result.brand.has_help_center;

    if (hasHelpCenter) {
      const helpCenterNode: ContentNode = brandInDb?.getHelpCenterContentNode(
        connector.id
      ) ?? {
        provider: "zendesk",
        internalId: getHelpCenterInternalId({
          connectorId: connector.id,
          brandId,
        }),
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
  }
  return nodes;
}

/**
 * Retrieves the children nodes of a Help Center, which are the categories.
 */
async function getHelpCenterChildren(
  zendeskApiClient: Client,
  {
    connectorId,
    brandId,
    isReadPermissionsOnly,
    parentInternalId,
  }: {
    connectorId: ModelId;
    brandId: number;
    parentInternalId: string;
    isReadPermissionsOnly: boolean;
  }
): Promise<ContentNode[]> {
  /// it's ok to fetch read-only data here, if !isReadPermissionsOnly, we are only using the categories in db to
  // check if they have read permissions
  const categoriesInDatabase =
    await ZendeskCategoryResource.fetchByBrandIdReadOnly({
      connectorId,
      brandId,
    });
  if (isReadPermissionsOnly) {
    return categoriesInDatabase.map((category) =>
      category.toContentNode(connectorId, { expandable: true })
    );
  } else {
    // fetching the categories
    await changeZendeskClientSubdomain(zendeskApiClient, {
      connectorId,
      brandId,
    });
    const categories = await zendeskApiClient.helpcenter.categories.list();

    return categories.map(
      (category) =>
        categoriesInDatabase
          .find((c) => c.categoryId === category.id)
          ?.toContentNode(connectorId) ?? {
          provider: "zendesk",
          internalId: getCategoryInternalId({
            connectorId,
            brandId,
            categoryId: category.id,
          }),
          parentInternalId: parentInternalId,
          type: "folder",
          title: category.name,
          sourceUrl: category.html_url,
          expandable: false,
          permission: "none",
          dustDocumentId: null,
          lastUpdatedAt: null,
        }
    );
  }
}

/**
 * Retrieves the children nodes of a node identified by its internal ID.
 */
export async function retrieveChildrenNodes({
  connector,
  parentInternalId,
  filterPermission,
}: {
  connector: ConnectorResource;
  parentInternalId: string | null;
  filterPermission: ConnectorPermission | null;
  viewType: ContentNodesViewType;
}): Promise<ContentNode[]> {
  const zendeskApiClient = createZendeskClient(
    await getZendeskSubdomainAndAccessToken(connector.connectionId)
  );
  const isReadPermissionsOnly = filterPermission === "read";

  if (!parentInternalId) {
    return getRootLevelContentNodes(zendeskApiClient, {
      connectorId: connector.id,
      isReadPermissionsOnly,
    });
  }
  const { type, objectIds } = getIdsFromInternalId(
    connector.id,
    parentInternalId
  );
  switch (type) {
    case "brand": {
      return getBrandChildren(zendeskApiClient, connector, {
        brandId: objectIds.brandId,
        isReadPermissionsOnly,
        parentInternalId,
      });
    }
    case "help-center": {
      return getHelpCenterChildren(zendeskApiClient, {
        connectorId: connector.id,
        brandId: objectIds.brandId,
        isReadPermissionsOnly,
        parentInternalId,
      });
    }
    // If the parent is a brand's tickets, we retrieve the list of tickets for the brand.
    case "tickets": {
      if (isReadPermissionsOnly) {
        const ticketsInDb = await ZendeskTicketResource.fetchByBrandIdReadOnly({
          connectorId: connector.id,
          brandId: objectIds.brandId,
        });
        return ticketsInDb.map((ticket) => ticket.toContentNode(connector.id));
      }
      return [];
    }
    // If the parent is a category, we retrieve the list of articles for this category.
    case "category": {
      if (isReadPermissionsOnly) {
        const articlesInDb =
          await ZendeskArticleResource.fetchByCategoryIdReadOnly({
            connectorId: connector.id,
            categoryId: objectIds.categoryId,
          });
        return articlesInDb.map((article) =>
          article.toContentNode(connector.id)
        );
      }
      return [];
    }
    // Single tickets and articles have no children.
    case "ticket":
    case "article":
      return [];
    default:
      assertNever(type);
  }
}
