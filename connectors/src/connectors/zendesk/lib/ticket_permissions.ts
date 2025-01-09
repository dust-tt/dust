import type { ModelId } from "@dust-tt/types";

import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import { createZendeskClient } from "@connectors/connectors/zendesk/lib/zendesk_api";
import logger from "@connectors/logger/logger";
import {
  ZendeskBrandResource,
  ZendeskTicketResource,
} from "@connectors/resources/zendesk_resources";

/**
 * Marks the node "Tickets" of a Brand as permission "read".
 */
export async function allowSyncZendeskTickets({
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
    return true;
  }
  // fetching the brand from Zendesk
  const zendeskApiClient = createZendeskClient(
    await getZendeskSubdomainAndAccessToken(connectionId)
  );
  const {
    result: { brand: fetchedBrand },
  } = await zendeskApiClient.brand.show(brandId);

  const hasHelpCenter =
    fetchedBrand.has_help_center &&
    fetchedBrand.help_center_state === "enabled";

  if (fetchedBrand) {
    await ZendeskBrandResource.makeNew({
      blob: {
        subdomain: fetchedBrand.subdomain,
        connectorId: connectorId,
        brandId: fetchedBrand.id,
        name: fetchedBrand.name || "Brand",
        ticketsPermission: "read",
        helpCenterPermission: "none",
        hasHelpCenter,
        url: fetchedBrand.url,
      },
    });
    return true;
  }
  logger.error(
    { connectorId, brandId },
    "[Zendesk] Brand could not be fetched."
  );
  return false;
}

/**
 * Mark the node "Tickets" and all the children tickets for a Brand as permission "none".
 */
export async function forbidSyncZendeskTickets({
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
      "[Zendesk] Brand not found, could not disable sync."
    );
    return null;
  }

  // updating the field ticketsPermission to "none" for the brand
  await brand.revokeTicketsPermissions();
  // revoking the permissions for all the children tickets
  await ZendeskTicketResource.revokePermissionsForBrand({
    connectorId,
    brandId,
  });
  return brand;
}
