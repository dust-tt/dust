import type { ModelId } from "@dust-tt/types";

import { getZendeskAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import { createZendeskClient } from "@connectors/connectors/zendesk/lib/zendesk_api";
import logger from "@connectors/logger/logger";
import {
  ZendeskBrandResource,
  ZendeskTicketResource,
} from "@connectors/resources/zendesk_resources";

export async function allowSyncZendeskTickets({
  subdomain,
  connectorId,
  connectionId,
  brandId,
  withChildren = false,
}: {
  subdomain: string;
  connectorId: ModelId;
  connectionId: string;
  brandId: number;
  withChildren?: boolean;
}): Promise<ZendeskBrandResource | null> {
  let brand = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  if (brand?.ticketsPermission === "none") {
    await brand.update({ ticketsPermission: "read" });
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
          helpCenterPermission: "none",
          ticketsPermission: "read",
          hasHelpCenter: fetchedBrand.has_help_center,
          url: fetchedBrand.url,
        },
      });
    } else {
      logger.error({ brandId }, "[Zendesk] Brand could not be fetched.");
      return null;
    }
  }

  if (withChildren) {
    throw new Error("withChildren not implemented yet.");
  }

  return brand;
}

/**
 * Mark a help center as permission "none" and all children (collections and articles).
 */
export async function revokeSyncZendeskTickets({
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

  // updating the field ticketsPermission to "none" for the brand
  await brand.revokeTicketsPermissions();
  // revoking the permissions for all the children tickets
  await ZendeskTicketResource.revokePermissionsForBrand({
    connectorId,
    brandId,
  });
  return brand;
}
