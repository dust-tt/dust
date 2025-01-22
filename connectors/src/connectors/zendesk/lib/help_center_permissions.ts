import type { ModelId } from "@dust-tt/types";

import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  changeZendeskClientSubdomain,
  createZendeskClient,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import logger from "@connectors/logger/logger";
import {
  ZendeskBrandResource,
  ZendeskCategoryResource,
} from "@connectors/resources/zendesk_resources";

/**
 * Marks a help center as permission "read".
 * If we are in this function, it means that the user selected the Help Center in the UI.
 * Therefore, we don't need to check for the has_help_center attributes
 * since the box does not appear in the UI then.
 */
export async function allowSyncZendeskHelpCenter({
  connectorId,
  connectionId,
  brandId,
}: {
  connectorId: ModelId;
  connectionId: string;
  brandId: number;
}): Promise<boolean> {
  const zendeskApiClient = createZendeskClient(
    await getZendeskSubdomainAndAccessToken(connectionId)
  );
  const brand = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });

  if (brand) {
    await brand.grantHelpCenterPermissions();
  } else {
    // fetching the brand from Zendesk
    const {
      result: { brand: fetchedBrand },
    } = await zendeskApiClient.brand.show(brandId);

    if (!fetchedBrand) {
      logger.error(
        { connectorId, brandId },
        "[Zendesk] Brand could not be fetched."
      );
      return false;
    }

    await ZendeskBrandResource.makeNew({
      blob: {
        subdomain: fetchedBrand.subdomain,
        connectorId: connectorId,
        brandId: fetchedBrand.id,
        name: fetchedBrand.name || "Brand",
        ticketsPermission: "none",
        helpCenterPermission: "read",
        url: fetchedBrand.url,
      },
    });
  }

  return true;
}

/**
 * Mark a help center as permission "none" in db to indicate it was explicitly selected by the user.
 */
export async function forbidSyncZendeskHelpCenter({
  connectorId,
  brandId,
}: {
  connectorId: ModelId;
  brandId: number;
}): Promise<boolean> {
  const brand = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  if (!brand) {
    logger.error(
      { connectorId, brandId },
      "[Zendesk] Brand not found, could not disable sync."
    );
    return false;
  }

  // updating the field helpCenterPermission to "none" for the brand
  await brand.revokeHelpCenterPermissions();

  return true;
}

/**
 * Marks a category with "read" permissions in db to indicate it was explicitly selected by the user.
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
}): Promise<boolean> {
  const category = await ZendeskCategoryResource.fetchByCategoryId({
    connectorId,
    brandId,
    categoryId,
  });

  if (category) {
    await category.grantPermissions();
    return true;
  } else {
    const zendeskApiClient = createZendeskClient(
      await getZendeskSubdomainAndAccessToken(connectionId)
    );

    /// creating the brand if missing
    const brand = await ZendeskBrandResource.fetchByBrandId({
      connectorId,
      brandId,
    });
    if (!brand) {
      const {
        result: { brand: fetchedBrand },
      } = await zendeskApiClient.brand.show(brandId);

      if (!fetchedBrand) {
        logger.error(
          { connectorId, brandId },
          "[Zendesk] Brand could not be fetched."
        );
        return false;
      }

      await ZendeskBrandResource.makeNew({
        blob: {
          subdomain: fetchedBrand.subdomain,
          connectorId: connectorId,
          brandId: fetchedBrand.id,
          name: fetchedBrand.name || "Brand",
          ticketsPermission: "none",
          helpCenterPermission: "none",
          url: fetchedBrand.url,
        },
      });
    }

    await changeZendeskClientSubdomain(zendeskApiClient, {
      connectorId,
      brandId,
    });
    const { result: fetchedCategory } =
      await zendeskApiClient.helpcenter.categories.show(categoryId);
    if (fetchedCategory) {
      await ZendeskCategoryResource.makeNew({
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
      logger.error(
        { connectorId, categoryId },
        "[Zendesk] Category could not be fetched."
      );
      return false;
    }
    return true;
  }
}

/**
 * Mark a category with "none" permissions in db to indicate it was explicitly unselected by the user.
 */
export async function forbidSyncZendeskCategory({
  connectorId,
  brandId,
  categoryId,
}: {
  connectorId: ModelId;
  brandId: number;
  categoryId: number;
}): Promise<boolean> {
  // revoking the permissions for the category
  const category = await ZendeskCategoryResource.fetchByCategoryId({
    connectorId,
    brandId,
    categoryId,
  });
  if (!category) {
    logger.error(
      { connectorId, categoryId },
      "[Zendesk] Category not found, could not disable sync."
    );
    return false;
  }
  await category.revokePermissions();

  return true;
}
