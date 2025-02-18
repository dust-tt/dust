import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  ModelId,
} from "@dust-tt/types";
import { assertNever, MIME_TYPES } from "@dust-tt/types";
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
  const brandsWithHelpCenter = brands.filter(
    (brand) => brand.helpCenterPermission === "read"
  );

  const helpCenterNodes: ContentNode[] = brandsWithHelpCenter.map((brand) =>
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

  const categories =
    await ZendeskCategoryResource.fetchAllReadOnly(connectorId);
  const categoryNodes: ContentNode[] = categories.map((category) =>
    category.toContentNode(connectorId, { expandable: true })
  );

  return [...helpCenterNodes, ...ticketNodes, ...categoryNodes];
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
    return [
      ...brandsInDatabase
        .filter((b) => b.ticketsPermission === "read")
        .map((b) => b.getTicketsContentNode(connectorId, { richTitle: true })),
      ...brandsInDatabase
        .filter((b) => b.helpCenterPermission === "read")
        .map((b) =>
          b.getHelpCenterContentNode(connectorId, { richTitle: true })
        ),
    ];
  } else {
    const { result: brands } = await zendeskApiClient.brand.list();
    return brands.map(
      (brand) =>
        brandsInDatabase
          .find((b) => b.brandId === brand.id)
          ?.toContentNode(connectorId) ?? {
          internalId: getBrandInternalId({ connectorId, brandId: brand.id }),
          parentInternalId: null,
          type: "folder",
          title: brand.name || "Brand",
          sourceUrl: brand.brand_url,
          expandable: true,
          permission: "none",
          lastUpdatedAt: null,
          mimeType: MIME_TYPES.ZENDESK.BRAND,
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

  // fetching the brand to check whether it has an enabled Help Center
  const {
    result: { brand: fetchedBrand },
  } = await zendeskApiClient.brand.show(brandId);

  if (isReadPermissionsOnly) {
    if (brandInDb?.ticketsPermission === "read") {
      nodes.push(
        brandInDb.getTicketsContentNode(connector.id, { expandable: true })
      );
    }
    if (
      fetchedBrand.has_help_center &&
      brandInDb?.helpCenterPermission === "read"
    ) {
      nodes.push(brandInDb.getHelpCenterContentNode(connector.id));
    }
  } else {
    const ticketsNode: ContentNode = brandInDb?.getTicketsContentNode(
      connector.id
    ) ?? {
      internalId: getTicketsInternalId({ connectorId: connector.id, brandId }),
      parentInternalId: parentInternalId,
      type: "folder",
      title: "Tickets",
      sourceUrl: null,
      expandable: false,
      permission: "none",
      lastUpdatedAt: null,
      mimeType: MIME_TYPES.ZENDESK.TICKETS,
    };
    nodes.push(ticketsNode);

    // only displaying the Help Center node if the brand has an enabled Help Center
    if (fetchedBrand.has_help_center) {
      const helpCenterNode: ContentNode = brandInDb?.getHelpCenterContentNode(
        connector.id
      ) ?? {
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
        lastUpdatedAt: null,
        mimeType: MIME_TYPES.ZENDESK.HELP_CENTER,
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
  const categoriesInDatabase = await ZendeskCategoryResource.fetchByBrandId({
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
          lastUpdatedAt: null,
          mimeType: MIME_TYPES.ZENDESK.CATEGORY,
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
        const ticketsInDb = await ZendeskTicketResource.fetchByBrandId({
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
        const articlesInDb = await ZendeskArticleResource.fetchByCategoryId({
          connectorId: connector.id,
          ...objectIds,
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
