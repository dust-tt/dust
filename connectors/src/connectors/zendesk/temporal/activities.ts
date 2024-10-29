import type { ModelId } from "@dust-tt/types";

import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import { ConnectorResource } from "@connectors/resources/connector_resource";

async function _getZendeskConnectorOrRaise(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("[Zendesk] Connector not found.");
  }
  return connector;
}

/**
 * This activity is responsible for updating the lastSyncStartTime of the connector to now.
 */
export async function saveZendeskConnectorStartSync({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const connector = await _getZendeskConnectorOrRaise(connectorId);
  const res = await syncStarted(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

/**
 * This activity is responsible for updating the sync status of the connector to "success".
 */
export async function saveZendeskConnectorSuccessSync({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const connector = await _getZendeskConnectorOrRaise(connectorId);
  const res = await syncSucceeded(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

/**
 * This activity is responsible for syncing a Brand.
 * It does not sync the content inside the Brand, only the Brand data in itself.
 *
 * It is going to update the name of the Brand if it has changed.
 * If the Brand is not allowed anymore, it will delete all its data.
 * If the Brand is not present on Zendesk anymore, it will delete all its data as well.
 *
 * @returns true if the Brand was updated, false if it was deleted.
 */
// eslint-disable-next-line no-empty-pattern
export async function syncZendeskBrandActivity({}: {
  connectorId: ModelId;
  brandId: number;
  currentSyncDateMs: number;
}): Promise<{ helpCenterAllowed: boolean; ticketsAllowed: boolean }> {
  return { helpCenterAllowed: false, ticketsAllowed: false };
}

/**
 * This activity is responsible for checking the permissions for a Brand's Help Center.
 *
 * @returns true if the Help Center has read permissions enabled.
 */
// eslint-disable-next-line no-empty-pattern
export async function checkZendeskHelpCenterPermissionsActivity({}: {
  connectorId: ModelId;
  brandId: number;
}): Promise<boolean> {
  return false;
}

/**
 * This activity is responsible for checking the permissions for a Brand's Tickets.
 *
 * @returns true if the Help Center has read permissions enabled.
 */
// eslint-disable-next-line no-empty-pattern
export async function checkZendeskTicketsPermissionsActivity({}: {
  connectorId: ModelId;
  brandId: number;
}): Promise<boolean> {
  return false;
}

/**
 * Retrieves the categories for a given Brand.
 */
// eslint-disable-next-line no-empty-pattern
export async function getZendeskCategoriesActivity({}: {
  connectorId: ModelId;
  brandId: number;
}): Promise<number[]> {
  return [];
}

/**
 * This activity is responsible for syncing a Category.
 * It does not sync the articles inside the Category, only the Category data in itself.
 *
 * It is going to update the name of the Category if it has changed.
 * If the Category is not allowed anymore, it will delete all its data.
 * If the Category is not present on Zendesk anymore, it will delete all its data as well.
 *
 * @returns true if the Category was updated, false if it was deleted.
 */
// eslint-disable-next-line no-empty-pattern
export async function syncZendeskCategoryActivity({}: {
  connectorId: ModelId;
  categoryId: number;
  currentSyncDateMs: number;
}): Promise<boolean> {
  return true;
}

/**
 * This activity is responsible for syncing all the articles in a Category.
 * It does not sync the Category, only the Articles.
 *
 * @returns true if the Category was updated, false if it was deleted.
 */
// eslint-disable-next-line no-empty-pattern
export async function syncZendeskArticlesActivity({}: {
  connectorId: ModelId;
  categoryId: number;
  currentSyncDateMs: number;
  forceResync: boolean;
}) {}

/**
 * This activity is responsible for syncing all the tickets for a Brand.
 */
// eslint-disable-next-line no-empty-pattern
export async function syncZendeskTicketsActivity({}: {
  connectorId: ModelId;
  brandId: number;
  currentSyncDateMs: number;
  forceResync: boolean;
  afterCursor: string | null;
}): Promise<{ hasMore: boolean; afterCursor: string }> {
  return { hasMore: false, afterCursor: "" };
}
