import type { ModelId } from "@dust-tt/types";
import type { Client } from "node-zendesk";

import logger from "@connectors/logger/logger";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";

/**
 * Fetches a brand and syncs it with the db.
 * @returns True if the fetch succeeded, false otherwise.
 */
export async function fetchBrandAndSync(
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
