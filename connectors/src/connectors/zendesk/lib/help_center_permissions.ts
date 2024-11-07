import type { ModelId } from "@dust-tt/types";

import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  changeZendeskClientSubdomain,
  createZendeskClient,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import logger from "@connectors/logger/logger";
import {
  ZendeskArticleResource,
  ZendeskBrandResource,
  ZendeskCategoryResource,
} from "@connectors/resources/zendesk_resources";

/**
 * Marks a help center as permission "read", optionally alongside all its children (categories and articles).
 */
export async function allowSyncZendeskHelpCenter({
  connectorId,
  connectionId,
  brandId,
  withChildren = true,
}: {
  connectorId: ModelId;
  connectionId: string;
  brandId: number;
  withChildren?: boolean;
}): Promise<ZendeskBrandResource | null> {
  let brand = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });

  if (brand?.helpCenterPermission === "none") {
    await brand.update({ helpCenterPermission: "read" });
  }

  const { accessToken, subdomain } =
    await getZendeskSubdomainAndAccessToken(connectionId);
  const zendeskApiClient = createZendeskClient({
    token: accessToken,
    subdomain,
  });

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
      logger.error(
        { connectorId, brandId },
        "[Zendesk] Brand could not be fetched."
      );
      return null;
    }
  }

  // updating permissions for all the children categories
  if (withChildren) {
    await changeZendeskClientSubdomain({ client: zendeskApiClient, brandId });
    try {
      const categories = await zendeskApiClient.helpcenter.categories.list();
      categories.forEach((category) =>
        allowSyncZendeskCategory({
          connectionId,
          connectorId,
          categoryId: category.id,
          brandId,
        })
      );
    } catch (e) {
      logger.error(
        { connectorId, brandId },
        "[Zendesk] Categories could not be fetched."
      );
      return null;
    }
  }

  return brand;
}

/**
 * Mark a help center as permission "none" and all children (collections and articles).
 */
export async function revokeSyncZendeskHelpCenter({
  connectorId,
  brandId,
  withChildren = true,
}: {
  connectorId: ModelId;
  brandId: number;
  withChildren?: boolean;
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

  // updating the field helpCenterPermission to "none" for the brand
  await brand.revokeHelpCenterPermissions();

  // revoking the permissions for all the children categories and articles
  if (withChildren) {
    await ZendeskCategoryResource.revokePermissionsForBrand({
      connectorId,
      brandId,
    });
    await ZendeskArticleResource.revokePermissionsForBrand({
      connectorId,
      brandId,
    });
  }

  return brand;
}

/**
 * Marks a category with "read" permissions, alongside all its children articles.
 */
export async function allowSyncZendeskCategory({
  connectorId,
  connectionId,
  brandId,
  categoryId,
}: {
  connectorId: ModelId;
  connectionId: string;
  brandId: number;
  categoryId: number;
}): Promise<ZendeskCategoryResource | null> {
  let category = await ZendeskCategoryResource.fetchByCategoryId({
    connectorId,
    categoryId,
  });
  if (category?.permission === "none") {
    await category.update({ permission: "read" });
  }

  const { accessToken, subdomain } =
    await getZendeskSubdomainAndAccessToken(connectionId);
  const zendeskApiClient = createZendeskClient({
    token: accessToken,
    subdomain,
  });

  if (!category) {
    await changeZendeskClientSubdomain({ client: zendeskApiClient, brandId });
    const { result: fetchedCategory } =
      await zendeskApiClient.helpcenter.categories.show(categoryId);
    if (fetchedCategory) {
      category = await ZendeskCategoryResource.makeNew({
        blob: {
          connectorId,
          brandId,
          name: fetchedCategory.name || "Category",
          categoryId,
          permission: "read",
          url: fetchedCategory.html_url,
          description: fetchedCategory.description,
        },
      });
    } else {
      logger.error({ categoryId }, "[Zendesk] Category could not be fetched.");
      return null;
    }
  }

  await allowSyncZendeskHelpCenter({
    connectorId,
    connectionId,
    brandId,
    withChildren: false,
  });

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
  // revoking the permissions for the category
  const category = await ZendeskCategoryResource.fetchByCategoryId({
    connectorId,
    categoryId,
  });
  if (!category) {
    logger.error(
      { categoryId },
      "[Zendesk] Category not found, could not revoke sync."
    );
    return null;
  }
  await category.revokePermissions();

  // revoking the permissions for all the children articles
  await ZendeskArticleResource.revokePermissionsForCategory({
    connectorId,
    categoryId,
  });

  // revoking the permissions for the help center if no other category is allowed
  const categories = await ZendeskCategoryResource.fetchByBrandId({
    connectorId,
    brandId: category.brandId,
  });
  if (categories.length === 0) {
    await revokeSyncZendeskHelpCenter({
      connectorId,
      brandId: category.brandId,
      withChildren: false,
    });
  }

  return category;
}
