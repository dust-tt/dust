import type { ModelId } from "@dust-tt/types";

import { syncBrandWithPermissions } from "@connectors/connectors/zendesk/lib/utils";
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
  return syncBrandWithPermissions({
    connectorId,
    connectionId,
    brandId,
    permissions: {
      ticketsPermission: "read",
      helpCenterPermission: "none",
    },
  });
}

/**
 * Mark the node "Tickets" and all the children tickets for a Brand as permission "none".
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
