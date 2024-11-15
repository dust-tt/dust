import type { ModelId } from "@dust-tt/types";

import { allowSyncZendeskHelpCenter } from "@connectors/connectors/zendesk/lib/help_center_permissions";
import { allowSyncZendeskTickets } from "@connectors/connectors/zendesk/lib/ticket_permissions";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import { createZendeskClient } from "@connectors/connectors/zendesk/lib/zendesk_api";
import logger from "@connectors/logger/logger";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";

/**
 * Mark a brand as permission "read" and all children (help center and tickets) if specified.
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

  if (brand) {
    await brand.grantTicketsPermissions();
    await brand.grantHelpCenterPermissions();
  } else {
    // fetching the brand from Zendesk
    const zendeskApiClient = createZendeskClient(
      await getZendeskSubdomainAndAccessToken(connectionId)
    );
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
        ticketsPermission: "read",
        helpCenterPermission: "read",
        hasHelpCenter: fetchedBrand.has_help_center,
        url: fetchedBrand.url,
      },
    });
  }

  await allowSyncZendeskHelpCenter({
    connectorId,
    connectionId,
    brandId,
  });
  await allowSyncZendeskTickets({
    connectorId,
    connectionId,
    brandId,
  });

  return true;
}

/**
 * Mark a help center as permission "none" and all children (collections and articles).
 */
export async function revokeSyncZendeskBrand({
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

  await brand.revokeAllPermissions();
  return brand;
}
