import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import { ZendeskClient } from "@connectors/connectors/zendesk/lib/zendesk_api";
import logger from "@connectors/logger/logger";
import {
  ZendeskBrandResource,
  ZendeskConfigurationResource,
} from "@connectors/resources/zendesk_resources";
import type { ModelId } from "@connectors/types";

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
  const configuration =
    await ZendeskConfigurationResource.fetchByConnectorId(connectorId);
  if (!configuration) {
    throw new Error(`[Zendesk] Configuration not found.`);
  }

  const brand = await ZendeskBrandResource.fetchByBrandId({
    connectorId,
    brandId,
  });

  if (brand) {
    await brand.grantTicketsPermissions();
    return true;
  }
  // fetching the brand from Zendesk
  const { subdomain, accessToken } =
    await getZendeskSubdomainAndAccessToken(connectionId);

  const zendeskClient = new ZendeskClient(
    accessToken,
    connectorId,
    configuration.rateLimitTransactionsPerSecond
  );
  const fetchedBrand = await zendeskClient.fetchBrand({
    brandId,
    subdomain,
  });

  if (fetchedBrand) {
    await ZendeskBrandResource.makeNew({
      blob: {
        subdomain: fetchedBrand.subdomain,
        connectorId: connectorId,
        brandId: fetchedBrand.id,
        name: fetchedBrand.name || "Brand",
        ticketsPermission: "read",
        helpCenterPermission: "none",
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

  // updating the field ticketsPermission to "none" for the brand
  await brand.revokeTicketsPermissions();

  return true;
}
