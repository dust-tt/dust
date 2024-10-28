import type { ModelId } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import {
  continueAsNew,
  proxyActivities,
  setHandler,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/zendesk/temporal/activities";
import { INTERVAL_BETWEEN_SYNCS_MS } from "@connectors/connectors/zendesk/temporal/config";
import type { ZendeskUpdateSignal } from "@connectors/connectors/zendesk/temporal/signals";

import { zendeskUpdatesSignal } from "./signals";

const { saveZendeskConnectorStartSync, saveZendeskConnectorSuccessSync } =
  proxyActivities<typeof activities>({
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
  const categorySignals: ZendeskUpdateSignal[] = [];

  // If we get a signal, update the workflow state by adding help center ids.
  // Signals are sent when permissions are updated by the admin.
  setHandler(zendeskUpdatesSignal, (zendeskUpdates: ZendeskUpdateSignal[]) => {
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
          categoryIds.add(signal.zendeskId);
          categorySignals.push(signal);
          break;
        }
        default:
          assertNever(signal.type);
      }
    });
  });

  // If we got no signal, then we're on the scheduled execution
  if (
    brandIds.size === 0 &&
    brandHelpCenterIds.size === 0 &&
    brandTicketsIds.size === 0 &&
    categoryIds.size === 0
  ) {
    // TODO: refresh the data we don't receive updates about through the webhooks here
  }

  // Async operations allow Temporal's event loop to process signals.
  // If a signal arrives during an async operation, it will update the set before the next iteration.
  while (brandIds.size > 0) {
    // copying the set to avoid issues with concurrent modifications
    const brandIdsToProcess = new Set(brandIds);
    for (const brandId of brandIdsToProcess) {
      /// TODO: launch a child sync workflow for the whole brand here
      brandIds.delete(brandId);
    }
  }
  while (brandHelpCenterIds.size > 0) {
    const brandIdsToProcess = new Set(brandHelpCenterIds);
    for (const brandId of brandIdsToProcess) {
      /// TODO: launch a child sync workflow for the help center
      brandHelpCenterIds.delete(brandId);
    }
  }
  while (brandTicketsIds.size > 0) {
    const brandIdsToProcess = new Set(brandTicketsIds);
    for (const brandId of brandIdsToProcess) {
      /// TODO: launch a child sync workflow for the tickets
      brandTicketsIds.delete(brandId);
    }
  }
  while (categoryIds.size > 0) {
    const categoryIdsToProcess = new Set(categoryIds);
    for (const categoryId of categoryIdsToProcess) {
      if (!categoryIds.has(categoryId)) {
        continue;
      }
      /// TODO: launch a child sync workflow for the category
      categoryIds.delete(categoryId);
    }
  }

  // run cleanup here if needed

  await saveZendeskConnectorSuccessSync({ connectorId });

  await sleep(INTERVAL_BETWEEN_SYNCS_MS);

  await continueAsNew<typeof zendeskSyncWorkflow>({ connectorId });
}
