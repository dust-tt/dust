import type { ModelId } from "@dust-tt/types";
import type { Client } from "node-zendesk";

import logger from "@connectors/logger/logger";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";

/**
 * Syncs the permissions of a brand, fetching it and pushing it if not found in the db.
 * @returns True if the fetch succeeded, false otherwise.
 */
export async function syncBrandWithPermissions(
  zendeskApiClient: Client,
  {
    connectorId,
    brandId,
    permissions,
  }: {
    connectorId: ModelId;
    brandId: number;
    permissions: {
      ticketsPermission: "read" | "none";
      helpCenterPermission: "read" | "none";
    };
  }
): Promise<boolean> {
  const brand = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });

  if (
    permissions.helpCenterPermission === "read" &&
    brand?.helpCenterPermission === "none"
  ) {
    await brand.update({ helpCenterPermission: "read" });
  }
  if (
    permissions.ticketsPermission === "read" &&
    brand?.ticketsPermission === "none"
  ) {
    await brand.update({ ticketsPermission: "read" });
  }

  if (brand) {
    return true;
  }

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
