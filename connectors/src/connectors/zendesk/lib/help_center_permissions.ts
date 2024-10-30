import type { ModelId } from "@dust-tt/types";

import { getZendeskAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
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
}): Promise<ZendeskBrandResource | null> {
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
      logger.error(
        { connectorId, brandId },
        "[Zendesk] Brand could not be fetched."
      );
      return null;
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
      "[Zendesk] Categories could not be fetched."
    );
    return null;
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

  // updating the field helpCenterPermission to "none" for the brand
  await brand.revokeHelpCenterPermissions();
  // revoking the permissions for all the children categories and articles
  await ZendeskCategoryResource.revokePermissionsForBrand({
    connectorId,
    brandId,
  });
  await ZendeskArticleResource.revokePermissionsForBrand({
    connectorId,
    brandId,
  });
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
}): Promise<ZendeskCategoryResource | null> {
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
      return null;
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
