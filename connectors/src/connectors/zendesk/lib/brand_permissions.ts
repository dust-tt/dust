import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import { fetchZendeskBrand } from "@connectors/connectors/zendesk/lib/zendesk_api";
import logger from "@connectors/logger/logger";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";
import type { ModelId } from "@connectors/types";

/**
 * Mark a brand as permission "read" in db to indicate it was explicitly selected by the user.
 * Creates the brand by fetching it from Zendesk if it does not exist in db.
 */
export async function allowSyncZendeskBrand({
  connectorId,
  connectionId,
  brandId,
}: {
  connectorId: ModelId;
  connectionId: string;
  brandId: number;
}): Promise<boolean> {
  const brand = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });

  // fetching the brand from Zendesk
  const { subdomain, accessToken } =
    await getZendeskSubdomainAndAccessToken(connectionId);
  const fetchedBrand = await fetchZendeskBrand({
    brandId,
    subdomain,
    accessToken,
  });

  if (!fetchedBrand) {
    logger.error(
      { connectorId, brandId },
      "[Zendesk] Brand could not be fetched."
    );
    return false;
  }

  // creating the brand if it does not exist yet in db
  if (brand) {
    await brand.grantTicketsPermissions();
    if (fetchedBrand.has_help_center) {
      await brand.grantHelpCenterPermissions();
    }
  } else {
    await ZendeskBrandResource.makeNew({
      blob: {
        subdomain: fetchedBrand.subdomain,
        connectorId: connectorId,
        brandId: fetchedBrand.id,
        name: fetchedBrand.name || "Brand",
        ticketsPermission: "read",
        helpCenterPermission: fetchedBrand.has_help_center ? "read" : "none",
        url: fetchedBrand.url,
      },
    });
  }

  return true;
}

/**
 * Mark a brand as permission "none" in db to indicate it was explicitly unselected by the user.
 */
export async function forbidSyncZendeskBrand({
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

  await brand.revokeHelpCenterPermissions();
  await brand.revokeTicketsPermissions();

  return true;
}
