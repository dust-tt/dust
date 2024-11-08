import type { ModelId } from "@dust-tt/types";

import { allowSyncZendeskHelpCenter } from "@connectors/connectors/zendesk/lib/help_center_permissions";
import { allowSyncZendeskTickets } from "@connectors/connectors/zendesk/lib/ticket_permissions";
import { syncBrandWithPermissions } from "@connectors/connectors/zendesk/lib/utils";
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
  const syncSuccess = await syncBrandWithPermissions({
    connectorId,
    connectionId,
    brandId,
    permissions: {
      ticketsPermission: "none",
      helpCenterPermission: "read",
    },
  });
  if (!syncSuccess) {
    return false; // stopping early if the brand sync failed
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
