import type { ModelId } from "@dust-tt/types";
import { assertNever } from "@temporalio/common/lib/type-helpers";
import {
  executeChild,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/zendesk/temporal/activities";
import type * as gc_activities from "@connectors/connectors/zendesk/temporal/gc_activities";
import type * as incremental_activities from "@connectors/connectors/zendesk/temporal/incremental_activities";
import type {
  ZendeskCategoryUpdateSignal,
  ZendeskUpdateSignal,
} from "@connectors/connectors/zendesk/temporal/signals";
import { zendeskUpdatesSignal } from "@connectors/connectors/zendesk/temporal/signals";

const {
  syncZendeskBrandActivity,
  syncZendeskCategoryActivity,
  syncZendeskCategoryBatchActivity,
  syncZendeskArticleBatchActivity,
  syncZendeskTicketBatchActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "15 minutes",
});

const {
  setZendeskTimestampCursorActivity,
  getZendeskTimestampCursorActivity,
  syncZendeskTicketUpdateBatchActivity,
  syncZendeskArticleUpdateBatchActivity,
} = proxyActivities<typeof incremental_activities>({
  startToCloseTimeout: "5 minutes",
});

const {
  removeOutdatedTicketBatchActivity,
  removeMissingArticleBatchActivity,
  getZendeskBrandsWithHelpCenterToDeleteActivity,
  getZendeskBrandsWithTicketsToDeleteActivity,
  deleteCategoryBatchActivity,
  deleteTicketBatchActivity,
} = proxyActivities<typeof gc_activities>({
  startToCloseTimeout: "15 minutes",
});

const {
  zendeskConnectorStartSync,
  saveZendeskConnectorSuccessSync,
  getZendeskHelpCenterReadAllowedBrandIdsActivity,
  getZendeskTicketsAllowedBrandIdsActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
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
  const { cursor } = await zendeskConnectorStartSync(connectorId);
  const isInitialSync = !cursor;

  const brandIds = new Set<number>();
  const brandSignals = new Map<number, ZendeskUpdateSignal>();
  const brandHelpCenterIds = new Set<number>();
  const brandHelpCenterSignals = new Map<number, ZendeskUpdateSignal>();
  const brandTicketsIds = new Set<number>();
  const brandTicketSignals = new Map<number, ZendeskUpdateSignal>();

  const categoryIds = new Set<number>();
  const categoryBrands: Record<number, number> = {};
  const categorySignals = new Map<number, ZendeskCategoryUpdateSignal>();

  // If we get a signal, update the workflow state by adding help center ids.
  // Signals are sent when permissions are updated by the admin.
  setHandler(
    zendeskUpdatesSignal,
    (zendeskUpdates: (ZendeskUpdateSignal | ZendeskCategoryUpdateSignal)[]) => {
      zendeskUpdates.forEach((signal) => {
        switch (signal.type) {
          case "brand": {
            brandIds.add(signal.zendeskId);
            brandSignals.set(signal.zendeskId, signal);
            break;
          }
          case "help-center": {
            brandHelpCenterIds.add(signal.zendeskId);
            brandHelpCenterSignals.set(signal.zendeskId, signal);
            break;
          }
          case "tickets": {
            brandTicketsIds.add(signal.zendeskId);
            brandTicketSignals.set(signal.zendeskId, signal);
            break;
          }
          case "category": {
            categoryIds.add(signal.categoryId);
            categoryBrands[signal.categoryId] = signal.brandId;
            categorySignals.set(signal.categoryId, signal);
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

  const {
    workflowId,
    searchAttributes: parentSearchAttributes,
    memo,
  } = workflowInfo();

  const currentSyncDateMs = new Date().getTime();

  if (
    !isInitialSync &&
    brandIds.size === 0 &&
    brandHelpCenterIds.size === 0 &&
    brandTicketsIds.size === 0 &&
    categoryIds.size === 0
  ) {
    await executeChild(zendeskIncrementalSyncWorkflow, {
      workflowId: `${workflowId}-incremental`,
      searchAttributes: parentSearchAttributes,
      args: [{ connectorId, currentSyncDateMs }],
      memo,
    });
  }

  // Async operations allow Temporal's event loop to process signals.
  // If a signal arrives during an async operation, it will update the set before the next iteration.
  while (brandIds.size > 0) {
    // copying the set to avoid issues with concurrent modifications
    const brandIdsToProcess = new Set(brandIds);
    for (const brandId of brandIdsToProcess) {
      const relatedSignal = brandSignals.get(brandId);
      const forceResync = relatedSignal?.forceResync || false;

      await executeChild(zendeskBrandSyncWorkflow, {
        workflowId: `${workflowId}-brand-${brandId}`,
        searchAttributes: parentSearchAttributes,
        args: [{ connectorId, brandId, currentSyncDateMs, forceResync }],
        memo,
      });
      brandIds.delete(brandId);
      brandHelpCenterIds.delete(brandId);
      brandTicketsIds.delete(brandId);
    }
  }
  while (brandHelpCenterIds.size > 0) {
    const brandIdsToProcess = new Set(brandHelpCenterIds);
    for (const brandId of brandIdsToProcess) {
      await executeChild(zendeskBrandHelpCenterSyncWorkflow, {
        workflowId: `${workflowId}-help-center-${brandId}`,
        searchAttributes: parentSearchAttributes,
        args: [{ connectorId, brandId, currentSyncDateMs }],
        memo,
      });
      brandHelpCenterIds.delete(brandId);
    }
  }
  while (brandTicketsIds.size > 0) {
    const brandIdsToProcess = new Set(brandTicketsIds);
    for (const brandId of brandIdsToProcess) {
      const relatedSignal = brandTicketSignals.get(brandId);
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
      const brandId = categoryBrands[categoryId];
      if (!brandId) {
        throw new Error(
          "Unreachable: a category ID was pushed without a brand."
        );
      }

      await executeChild(zendeskCategorySyncWorkflow, {
        workflowId: `${workflowId}-category-${categoryId}`,
        searchAttributes: parentSearchAttributes,
        args: [{ connectorId, categoryId, brandId, currentSyncDateMs }],
        memo,
      });
      categoryIds.delete(categoryId);
    }
  }

  await saveZendeskConnectorSuccessSync(connectorId, currentSyncDateMs);
}

/**
 * Syncs the tickets updated since the last scheduled execution.
 */
export async function zendeskIncrementalSyncWorkflow({
  connectorId,
  currentSyncDateMs,
}: {
  connectorId: ModelId;
  currentSyncDateMs: number;
}) {
  const [cursor, ticketBrandIds, helpCenterBrandIds] = await Promise.all([
    getZendeskTimestampCursorActivity(connectorId),
    getZendeskTicketsAllowedBrandIdsActivity(connectorId),
    getZendeskHelpCenterReadAllowedBrandIdsActivity(connectorId),
  ]);

  const startTimeMs = new Date(cursor).getTime(); // recasting the date since error may occur during Temporal's serialization
  const startTime = Math.floor(startTimeMs / 1000);

  for (const brandId of helpCenterBrandIds) {
    let articleSyncStartTime: number | null = startTime;
    while (articleSyncStartTime !== null) {
      articleSyncStartTime = await syncZendeskArticleUpdateBatchActivity({
        connectorId,
        brandId,
        currentSyncDateMs,
        startTime: articleSyncStartTime,
      });
    }
  }

  for (const brandId of ticketBrandIds) {
    await runZendeskActivityWithPagination((url) =>
      syncZendeskTicketUpdateBatchActivity({
        connectorId,
        startTime,
        brandId,
        currentSyncDateMs,
        url,
      })
    );
  }

  await setZendeskTimestampCursorActivity({ connectorId, currentSyncDateMs });
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
  if (helpCenterAllowed) {
    await runZendeskBrandHelpCenterSyncActivities({
      connectorId,
      brandId,
      currentSyncDateMs,
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
}: {
  connectorId: ModelId;
  brandId: number;
  currentSyncDateMs: number;
}) {
  const { helpCenterAllowed } = await syncZendeskBrandActivity({
    connectorId,
    brandId,
    currentSyncDateMs,
  });
  if (helpCenterAllowed) {
    await runZendeskBrandHelpCenterSyncActivities({
      connectorId,
      brandId,
      currentSyncDateMs,
    });
  }
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
  const { ticketsAllowed } = await syncZendeskBrandActivity({
    connectorId,
    brandId,
    currentSyncDateMs,
  });
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
 * Sync Workflow for a Category.
 * We sync a Category by fetching all the Articles that belong to it.
 */
export async function zendeskCategorySyncWorkflow({
  connectorId,
  categoryId,
  brandId,
  currentSyncDateMs,
}: {
  connectorId: ModelId;
  categoryId: number;
  brandId: number;
  currentSyncDateMs: number;
}) {
  const { shouldSyncArticles, helpCenterIsAllowed } =
    await syncZendeskCategoryActivity({
      connectorId,
      categoryId,
      currentSyncDateMs,
      brandId,
    });
  if (shouldSyncArticles) {
    await runZendeskActivityWithPagination((url) =>
      syncZendeskArticleBatchActivity({
        connectorId,
        brandId,
        categoryId,
        currentSyncDateMs,
        helpCenterIsAllowed: helpCenterIsAllowed === true,
        url,
      })
    );
  }
}

/**
 * Garbage collection workflow for Zendesk.
 *
 * This workflow is responsible for deleting the following (in this order):
 * - Outdated tickets.
 * - Articles that cannot be found anymore in the Zendesk API.
 * - Articles and categories (only those that are not selected) of the brands that have an unselected Help Center.
 * - Tickets of the brands that have no permission on tickets anymore.
 * - Brands that have no permission on tickets and Help Center anymore.
 */
export async function zendeskGarbageCollectionWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  // deleting the outdated tickets (deleted tickets are cleaned in the incremental sync)
  let hasMoreTickets = true;
  while (hasMoreTickets) {
    const { hasMore } = await removeOutdatedTicketBatchActivity(connectorId);
    hasMoreTickets = hasMore;
  }

  // deleting the articles that cannot be found anymore in the Zendesk API
  let brandIds =
    await getZendeskHelpCenterReadAllowedBrandIdsActivity(connectorId);
  for (const brandId of brandIds) {
    let cursor = null;
    do {
      cursor = await removeMissingArticleBatchActivity({
        connectorId,
        brandId,
        cursor,
      });
    } while (cursor !== null);
  }

  // cleaning the articles and categories of the brands that have no permission on their Help Center anymore
  brandIds = await getZendeskBrandsWithHelpCenterToDeleteActivity(connectorId);
  for (const brandId of brandIds) {
    let hasMoreCategories = true;
    while (hasMoreCategories) {
      const { hasMore } = await deleteCategoryBatchActivity({
        connectorId,
        brandId,
      });
      hasMoreCategories = hasMore;
    }
  }

  // cleaning the tickets of the brands that have no permission on tickets anymore
  brandIds = await getZendeskBrandsWithTicketsToDeleteActivity(connectorId);
  for (const brandId of brandIds) {
    let hasMoreTickets = true;
    while (hasMoreTickets) {
      const { hasMore } = await deleteTicketBatchActivity({
        connectorId,
        brandId,
      });
      hasMoreTickets = hasMore;
    }
  }
}

/**
 * Run the activities necessary to sync the Help Center of a Brand.
 */
async function runZendeskBrandHelpCenterSyncActivities({
  connectorId,
  brandId,
  currentSyncDateMs,
}: {
  connectorId: ModelId;
  brandId: number;
  currentSyncDateMs: number;
}) {
  const categoryIdsToSync = new Set<number>();

  let url: string | null = null; // next URL returned by the API
  let hasMore = true;
  while (hasMore) {
    // not using runZendeskActivityWithPagination because we need to add result.categoriesToUpdate to the Set
    const result = await syncZendeskCategoryBatchActivity({
      connectorId,
      brandId,
      currentSyncDateMs,
      url,
    });
    hasMore = result.hasMore || false;
    url = result.nextLink;
    result.categoriesToUpdate.forEach((categoryId) =>
      categoryIdsToSync.add(categoryId)
    );
  }

  for (const categoryId of categoryIdsToSync) {
    await runZendeskActivityWithPagination((url) =>
      syncZendeskArticleBatchActivity({
        connectorId,
        brandId,
        categoryId,
        helpCenterIsAllowed: true, // We know the Help Center is allowed because we're in this function.
        currentSyncDateMs,
        url,
      })
    );
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
  await runZendeskActivityWithPagination((url) =>
    syncZendeskTicketBatchActivity({
      connectorId,
      brandId,
      currentSyncDateMs,
      forceResync,
      url,
    })
  );
}

/**
 * Runs an activity function with cursor-based pagination.
 */
async function runZendeskActivityWithPagination(
  activity: (
    cursor: string | null
  ) => Promise<{ hasMore: boolean; nextLink: string | null }>
): Promise<void> {
  let url: string | null = null; // next URL returned by the API
  let hasMore = true;

  while (hasMore) {
    const result = await activity(url);
    hasMore = result.hasMore || false;
    url = result.nextLink;
  }
}
