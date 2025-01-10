import type { ModelId } from "@dust-tt/types";

import {
  allowSyncZendeskHelpCenter,
  forbidSyncZendeskHelpCenter,
} from "@connectors/connectors/zendesk/lib/help_center_permissions";
import {
  allowSyncZendeskTickets,
  forbidSyncZendeskTickets,
} from "@connectors/connectors/zendesk/lib/ticket_permissions";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  createZendeskClient,
  isBrandHelpCenterEnabled,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import logger from "@connectors/logger/logger";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";

/**
 * Mark a brand as permission "read", with all its children (help center and tickets + children).
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

  const helpCenterEnabled = isBrandHelpCenterEnabled(fetchedBrand);

  // creating the brand if it does not exist yet in db
  if (!brand) {
    await ZendeskBrandResource.makeNew({
      blob: {
        subdomain: fetchedBrand.subdomain,
        connectorId: connectorId,
        brandId: fetchedBrand.id,
        name: fetchedBrand.name || "Brand",
        ticketsPermission: "read",
        helpCenterPermission: helpCenterEnabled ? "read" : "none",
        url: fetchedBrand.url,
      },
    });
  }

  // setting the permissions for the brand:
  // can be redundant if already set when creating the brand but necessary because of the categories.
  if (helpCenterEnabled) {
    // allow the categories
    await allowSyncZendeskHelpCenter({
      connectorId,
      connectionId,
      brandId,
    });
  }
  await allowSyncZendeskTickets({
    connectorId,
    connectionId,
    brandId,
  });

  return true;
}

/**
 * Mark a brand as permission "none", with all its children (help center and tickets + children).
 */
export async function forbidSyncZendeskBrand({
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

  // revoke permissions for the two children resources (help center and tickets + respective children)
  await forbidSyncZendeskHelpCenter({ connectorId, brandId });
  await forbidSyncZendeskTickets({ connectorId, brandId });

  return brand;
}
