import type { ModelId } from "@dust-tt/types";
import type { Client } from "node-zendesk";

import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import { createZendeskClient } from "@connectors/connectors/zendesk/lib/zendesk_api";
import logger from "@connectors/logger/logger";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";

/**
 * Syncs the permissions of a brand, fetching it and pushing it if not found in the db.
 * Only works to grant permissions, to revoke permissions you would always have it in db and thus directly update.
 * @returns True if the fetch succeeded, false otherwise.
 */
export async function syncBrandWithPermissions({
  zendeskApiClient = null,
  connectorId,
  connectionId,
  brandId,
  permissions,
}: {
  zendeskApiClient?: Client | null;
  connectorId: ModelId;
  connectionId: string;
  brandId: number;
  permissions: {
    ticketsPermission: "read" | "none";
    helpCenterPermission: "read" | "none";
  };
}): Promise<boolean> {
  const brand = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });

  if (brand) {
    if (permissions.helpCenterPermission === "read") {
      await brand.grantHelpCenterPermissions();
    }
    if (permissions.ticketsPermission === "read") {
      await brand.grantTicketsPermissions();
    }

    return true;
  }

  zendeskApiClient ||= createZendeskClient(
    await getZendeskSubdomainAndAccessToken(connectionId)
  );

  const {
    result: { brand: fetchedBrand },
  } = await zendeskApiClient.brand.show(brandId);
  if (fetchedBrand) {
    await ZendeskBrandResource.makeNew({
      blob: {
        subdomain: fetchedBrand.subdomain,
        connectorId: connectorId,
        brandId: fetchedBrand.id,
        name: fetchedBrand.name || "Brand",
        ...permissions,
        hasHelpCenter: fetchedBrand.has_help_center,
        url: fetchedBrand.url,
      },
    });
    return true;
  } else {
    logger.error(
      { connectorId, brandId },
      "[Zendesk] Brand could not be fetched."
    );
    return false;
  }
}
