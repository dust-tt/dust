import type { ModelId } from "@dust-tt/types";
import { assertNever } from "@temporalio/common/lib/type-helpers";
import {
  executeChild,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/zendesk/temporal/activities";
import type {
  ZendeskCategoryUpdateSignal,
  ZendeskUpdateSignal,
} from "@connectors/connectors/zendesk/temporal/signals";
import { zendeskUpdatesSignal } from "@connectors/connectors/zendesk/temporal/signals";
const {
  getZendeskCategoriesActivity,
  syncZendeskBrandActivity,
  syncZendeskCategoryActivity,
  syncZendeskArticlesBatchActivity,
  syncZendeskTicketsBatchActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

const {
  checkZendeskHelpCenterPermissionsActivity,
  checkZendeskTicketsPermissionsActivity,
  saveZendeskConnectorStartSync,
  saveZendeskConnectorSuccessSync,
  getAllZendeskBrandsIdsActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

/**
 * Sync Workflow for Zendesk.
 * This workflow is responsible for syncing all the help centers and tickets for a given connector.
 * This workflow is run continuously and syncs all the entities that are stored in DB.
 * If a signal is received, it will sync the help centers and tickets that were modified.
 */
export async function zendeskSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  await saveZendeskConnectorStartSync({ connectorId });

  const brandIds = new Set<number>();
  const brandSignals: ZendeskUpdateSignal[] = [];
  const brandHelpCenterIds = new Set<number>();
  const brandHelpCenterSignals: ZendeskUpdateSignal[] = [];
  const brandTicketsIds = new Set<number>();
  const brandTicketSignals: ZendeskUpdateSignal[] = [];

  const categoryIds = new Set<number>();
  const categoryBrands: Record<number, number> = {};
  const categorySignals: ZendeskCategoryUpdateSignal[] = [];

  // If we get a signal, update the workflow state by adding help center ids.
  // Signals are sent when permissions are updated by the admin.
  setHandler(
    zendeskUpdatesSignal,
    (zendeskUpdates: (ZendeskUpdateSignal | ZendeskCategoryUpdateSignal)[]) => {
      zendeskUpdates.forEach((signal) => {
        switch (signal.type) {
          case "brand": {
            brandIds.add(signal.zendeskId);
            brandSignals.push(signal);
            break;
          }
          case "help-center": {
            brandHelpCenterIds.add(signal.zendeskId);
            brandHelpCenterSignals.push(signal);
            break;
          }
          case "tickets": {
            brandTicketsIds.add(signal.zendeskId);
            brandTicketSignals.push(signal);
            break;
          }
          case "category": {
            categoryIds.add(signal.categoryId);
            categoryBrands[signal.categoryId] = signal.brandId;
            categorySignals.push(signal);
            break;
          }
          default:
            assertNever(
              `Unexpected signal type received within Zendesk sync workflow.`,
              signal
            );
        }
      });
    }
  );

  // If we got no signal, then we're on the scheduled execution
  if (
    brandIds.size === 0 &&
    brandHelpCenterIds.size === 0 &&
    brandTicketsIds.size === 0 &&
    categoryIds.size === 0
  ) {
    const allBrandIds = await getAllZendeskBrandsIdsActivity({ connectorId });
    allBrandIds.forEach((brandId) => brandIds.add(brandId));
  }

  const {
    workflowId,
    searchAttributes: parentSearchAttributes,
    memo,
  } = workflowInfo();

  const currentSyncDateMs = new Date().getTime();

  // Async operations allow Temporal's event loop to process signals.
  // If a signal arrives during an async operation, it will update the set before the next iteration.
  while (brandIds.size > 0) {
    // copying the set to avoid issues with concurrent modifications
    const brandIdsToProcess = new Set(brandIds);
    for (const brandId of brandIdsToProcess) {
      const relatedSignal = brandSignals.find(
        (signal) => signal.zendeskId === brandId
      );
      const forceResync = relatedSignal?.forceResync || false;

      await executeChild(zendeskBrandSyncWorkflow, {
        workflowId: `${workflowId}-brand-${brandId}`,
        searchAttributes: parentSearchAttributes,
        args: [{ connectorId, brandId, currentSyncDateMs, forceResync }],
        memo,
      });
      brandIds.delete(brandId);
    }
  }
  while (brandHelpCenterIds.size > 0) {
    const brandIdsToProcess = new Set(brandHelpCenterIds);
    for (const brandId of brandIdsToProcess) {
      const relatedSignal = brandHelpCenterSignals.find(
        (signal) => signal.zendeskId === brandId
      );
      const forceResync = relatedSignal?.forceResync || false;

      await executeChild(zendeskBrandHelpCenterSyncWorkflow, {
        workflowId: `${workflowId}-help-center-${brandId}`,
        searchAttributes: parentSearchAttributes,
        args: [{ connectorId, brandId, currentSyncDateMs, forceResync }],
        memo,
      });
      brandHelpCenterIds.delete(brandId);
    }
  }
  while (brandTicketsIds.size > 0) {
    const brandIdsToProcess = new Set(brandTicketsIds);
    for (const brandId of brandIdsToProcess) {
      const relatedSignal = brandTicketSignals.find(
        (signal) => signal.zendeskId === brandId
      );
      const forceResync = relatedSignal?.forceResync || false;

      await executeChild(zendeskBrandTicketsSyncWorkflow, {
        workflowId: `${workflowId}-tickets-${brandId}`,
        searchAttributes: parentSearchAttributes,
        args: [{ connectorId, brandId, currentSyncDateMs, forceResync }],
        memo,
      });
      brandTicketsIds.delete(brandId);
    }
  }
  while (categoryIds.size > 0) {
    const categoryIdsToProcess = new Set(categoryIds);
    for (const categoryId of categoryIdsToProcess) {
      const relatedSignal = categorySignals.find(
        (signal) => signal.categoryId === categoryId
      );
      const forceResync = relatedSignal?.forceResync || false;
      const brandId = categoryBrands[categoryId];
      if (!brandId) {
        throw new Error(
          "Unreachable: a category ID was pushed without a brand."
        );
      }

      await executeChild(zendeskCategorySyncWorkflow, {
        workflowId: `${workflowId}-category-${categoryId}`,
        searchAttributes: parentSearchAttributes,
        args: [
          { connectorId, categoryId, brandId, currentSyncDateMs, forceResync },
        ],
        memo,
      });
      categoryIds.delete(categoryId);
    }
  }

  // run cleanup here if needed

  await saveZendeskConnectorSuccessSync({ connectorId });
}

/**
 * Sync Workflow for an entire Brand (Help Center + Tickets).
 */
export async function zendeskBrandSyncWorkflow({
  connectorId,
  brandId,
  currentSyncDateMs,
  forceResync,
}: {
  connectorId: ModelId;
  brandId: number;
  currentSyncDateMs: number;
  forceResync: boolean;
}) {
  const { helpCenterAllowed, ticketsAllowed } = await syncZendeskBrandActivity({
    connectorId,
    brandId,
    currentSyncDateMs,
  });
  if (!helpCenterAllowed && !ticketsAllowed) {
    return; // nothing to sync since we don't have permission anymore
  }
  if (helpCenterAllowed) {
    await runZendeskBrandHelpCenterSyncActivities({
      connectorId,
      brandId,
      currentSyncDateMs,
      forceResync,
    });
  }
  if (ticketsAllowed) {
    await runZendeskBrandTicketsSyncActivities({
      connectorId,
      brandId,
      currentSyncDateMs,
      forceResync,
    });
  }
}

/**
 * Sync Workflow for a Help Center.
 * We sync a Help Center by fetching all the Categories and Articles.
 */
export async function zendeskBrandHelpCenterSyncWorkflow({
  connectorId,
  brandId,
  currentSyncDateMs,
  forceResync,
}: {
  connectorId: ModelId;
  brandId: number;
  currentSyncDateMs: number;
  forceResync: boolean;
}) {
  const isHelpCenterAllowed = await checkZendeskHelpCenterPermissionsActivity({
    connectorId,
    brandId,
  });
  if (!isHelpCenterAllowed) {
    return; // nothing to sync
  }
  await runZendeskBrandHelpCenterSyncActivities({
    connectorId,
    brandId,
    currentSyncDateMs,
    forceResync,
  });
}

/**
 * Sync Workflow for the Tickets associated to a Brand.
 */
export async function zendeskBrandTicketsSyncWorkflow({
  connectorId,
  brandId,
  currentSyncDateMs,
  forceResync,
}: {
  connectorId: ModelId;
  brandId: number;
  currentSyncDateMs: number;
  forceResync: boolean;
}) {
  const areTicketsAllowed = await checkZendeskTicketsPermissionsActivity({
    connectorId,
    brandId,
  });
  if (!areTicketsAllowed) {
    return; // nothing to sync
  }
  await runZendeskBrandTicketsSyncActivities({
    connectorId,
    brandId,
    currentSyncDateMs,
    forceResync,
  });
}

/**
 * Sync Workflow for a Category.
 * We sync a Category by fetching all the Articles that belong to it.
 */
export async function zendeskCategorySyncWorkflow({
  connectorId,
  categoryId,
  brandId,
  currentSyncDateMs,
  forceResync,
}: {
  connectorId: ModelId;
  categoryId: number;
  brandId: number;
  currentSyncDateMs: number;
  forceResync: boolean;
}) {
  const wasCategoryUpdated = await syncZendeskCategoryActivity({
    connectorId,
    categoryId,
    currentSyncDateMs,
    brandId,
  });
  if (!wasCategoryUpdated) {
    return; // nothing to sync
  }

  let cursor = null; // cursor involved in the pagination of the API
  let hasMore = true;

  while (hasMore) {
    const result = await syncZendeskArticlesBatchActivity({
      connectorId,
      categoryId,
      currentSyncDateMs,
      forceResync,
      cursor,
    });
    hasMore = result.hasMore || false;
    cursor = result.afterCursor;
  }
}

/**
 * Run the activities necessary to sync the Help Center of a Brand.
 */
async function runZendeskBrandHelpCenterSyncActivities({
  connectorId,
  brandId,
  currentSyncDateMs,
  forceResync,
}: {
  connectorId: ModelId;
  brandId: number;
  currentSyncDateMs: number;
  forceResync: boolean;
}) {
  const categoryIds = await getZendeskCategoriesActivity({
    connectorId,
    brandId,
  });
  const categoryIdsToSync = new Set<number>();
  for (const categoryId of categoryIds) {
    const wasCategoryUpdated = await syncZendeskCategoryActivity({
      connectorId,
      categoryId,
      currentSyncDateMs,
      brandId,
    });
    if (wasCategoryUpdated) {
      categoryIdsToSync.add(categoryId);
    }
  }

  for (const categoryId of categoryIdsToSync) {
    let hasMore = true;
    let cursor = null; // cursor involved in the pagination of the API

    while (hasMore) {
      const result = await syncZendeskArticlesBatchActivity({
        connectorId,
        categoryId,
        currentSyncDateMs,
        forceResync,
        cursor,
      });
      hasMore = result.hasMore || false;
      cursor = result.afterCursor;
    }
  }
}

/**
 * Run the activities necessary to sync the Tickets of a Brand.
 */
async function runZendeskBrandTicketsSyncActivities({
  connectorId,
  brandId,
  currentSyncDateMs,
  forceResync,
}: {
  connectorId: ModelId;
  brandId: number;
  currentSyncDateMs: number;
  forceResync: boolean;
}) {
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const result = await syncZendeskTicketsBatchActivity({
      connectorId,
      brandId,
      currentSyncDateMs,
      forceResync,
      cursor,
    });
    hasMore = result.hasMore || false;
    cursor = result.nextCursor;
  }
}
