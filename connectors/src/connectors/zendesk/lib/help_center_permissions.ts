import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  ModelId,
} from "@dust-tt/types";

import {
  getArticleInternalId,
  getBrandIdFromHelpCenterId,
  getBrandIdFromInternalId,
  getCategoryIdFromInternalId,
  getCategoryInternalId,
  getHelpCenterInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { getZendeskAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  changeZendeskClientSubdomain,
  createZendeskClient,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskBrandResource,
  ZendeskCategoryResource,
} from "@connectors/resources/zendesk_resources";

export async function allowSyncZendeskHelpCenter({
  subdomain,
  connectorId,
  connectionId,
  brandId,
}: {
  subdomain: string;
  connectorId: ModelId;
  connectionId: string;
  brandId: number;
}): Promise<ZendeskBrandResource> {
  let brand = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });

  if (brand?.helpCenterPermission === "none") {
    await brand.update({ helpCenterPermission: "read" });
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
          helpCenterPermission: "read",
          ticketsPermission: "none",
          hasHelpCenter: fetchedBrand.has_help_center,
          url: fetchedBrand.url,
        },
      });
    } else {
      logger.error({ brandId }, "[Zendesk] Brand could not be fetched.");
      throw new Error("Brand could not be fetched.");
    }
  }

  await changeZendeskClientSubdomain({ client: zendeskApiClient, brandId });
  try {
    const categories = await zendeskApiClient.helpcenter.categories.list();
    categories.forEach((category) =>
      allowSyncZendeskCategory({
        subdomain,
        connectionId,
        connectorId,
        categoryId: category.id,
      })
    );
  } catch (e) {
    logger.error(
      { connectorId, brandId },
      "[Zendesk] Could not fetch categories."
    );
  }

  return brand;
}

/**
 * Mark a help center as permission "none" and all children (collections and articles).
 */
export async function revokeSyncZendeskHelpCenter({
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

  await brand.revokeHelpCenterPermissions();
  return brand;
}

export async function allowSyncZendeskCategory({
  subdomain,
  connectorId,
  connectionId,
  categoryId,
}: {
  subdomain: string;
  connectorId: ModelId;
  connectionId: string;
  categoryId: number;
}): Promise<ZendeskCategoryResource> {
  let category = await ZendeskCategoryResource.fetchByCategoryId({
    connectorId,
    categoryId,
  });
  if (category?.permission === "none") {
    await category.update({ permission: "read" });
  }

  const token = await getZendeskAccessToken(connectionId);
  const zendeskApiClient = createZendeskClient({ token, subdomain });

  if (!category) {
    const { result: fetchedCategory } =
      await zendeskApiClient.helpcenter.categories.show(categoryId);
    if (fetchedCategory) {
      category = await ZendeskCategoryResource.makeNew({
        blob: {
          connectorId: connectorId,
          brandId: fetchedCategory.id,
          name: fetchedCategory.name || "Brand",
          categoryId: fetchedCategory.id,
          permission: "read",
          url: fetchedCategory.url,
        },
      });
    } else {
      logger.error({ categoryId }, "[Zendesk] Category could not be fetched.");
      throw new Error("Category could not be fetched.");
    }
  }

  return category;
}

/**
 * Mark a category with "none" permissions alongside all its children articles.
 */
export async function revokeSyncZendeskCategory({
  connectorId,
  categoryId,
}: {
  connectorId: ModelId;
  categoryId: number;
}): Promise<ZendeskCategoryResource | null> {
  const category = await ZendeskCategoryResource.fetchByCategoryId({
    connectorId,
    categoryId: categoryId,
  });
  if (!category) {
    logger.error(
      { categoryId: categoryId },
      "[Zendesk] Category not found, could not revoke sync."
    );
    return null;
  }

  await category.revokePermissions();
  return category;
}

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
  if (isRootLevel) {
    return [];
  }

  // If the parent is a Brand, we return a single node for its help center if it has one.
  let brandId = getBrandIdFromInternalId(connectorId, parentInternalId);
  if (brandId) {
    let hasHelpCenter = false;
    if (isReadPermissionsOnly) {
      const brandInDatabase = await ZendeskBrandResource.fetchByBrandId({
        connectorId,
        brandId,
      });
      hasHelpCenter = brandInDatabase !== null && brandInDatabase.hasHelpCenter;
    } else {
      try {
        const fetchedBrand = await zendeskApiClient.brand.show(brandId);
        hasHelpCenter = fetchedBrand.result.brand.has_help_center;
      } catch (e) {
        logger.error(
          { connectorId, brandId },
          "[Zendesk] Could not fetch brand."
        );
      }
    }
    if (hasHelpCenter) {
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

  // If the parent is a brand's help center, we retrieve the list of Categories for this brand.
  // If isReadPermissionsOnly, we retrieve the list of Categories from the DB that have permission == "read"
  // If isReadPermissionsOnly, we retrieve the list of Categories from Zendesk
  brandId = getBrandIdFromHelpCenterId(connectorId, parentInternalId);
  if (brandId) {
    const categoriesInDatabase =
      await ZendeskBrandResource.fetchReadOnlyCategories({
        connectorId,
        brandId,
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

  // If the parent is a category, we retrieve the list of articles for this category.
  // If isReadPermissionsOnly = true, we retrieve the list of Articles from the DB that have permission == "read"
  // If isReadPermissionsOnly = false, we do not show anything.
  const categoryId = getCategoryIdFromInternalId(connectorId, parentInternalId);
  if (categoryId && isReadPermissionsOnly) {
    const articlesInDatabase =
      await ZendeskCategoryResource.fetchReadOnlyArticles({
        connectorId,
        categoryId,
      });
    nodes = articlesInDatabase.map((article) => ({
      provider: connector.type,
      internalId: getArticleInternalId(connectorId, article.categoryId),
      parentInternalId: parentInternalId,
      type: "file",
      title: article.name,
      sourceUrl: article.url,
      expandable: false,
      permission: article.permission,
      dustDocumentId: null,
      lastUpdatedAt: article.updatedAt.getTime(),
    }));
  }

  nodes.sort((a, b) => a.title.localeCompare(b.title));
  return nodes;
}
