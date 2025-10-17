import {
  executeChild,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/intercom/temporal/activities";
import type { IntercomUpdateSignal } from "@connectors/connectors/intercom/temporal/signals";
import type { ModelId } from "@connectors/types";

import { getTeamIdsToSyncActivity } from "./activities";
import { intercomUpdatesSignal } from "./signals";

const {
  getHelpCenterIdsToSyncActivity,
  syncHelpCenterOnlyActivity,
  getLevel1CollectionsIdsActivity,
  syncLevel1CollectionWithChildrenActivity,
  syncArticleBatchActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

const {
  syncTeamOnlyActivity,
  getNextConversationBatchToSyncActivity,
  syncConversationBatchActivity,
  getNextOldConversationsBatchToDeleteActivity,
  syncAllTeamsActivity,
  deleteRevokedTeamsActivity,
  getNextRevokedConversationsBatchToDeleteActivity,
  deleteConversationBatchActivity,
  getSyncAllConversationsStatusActivity,
  setSyncAllConversationsStatusActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

const {
  saveIntercomConnectorStartSync,
  saveIntercomConnectorSuccessSync,
  upsertIntercomTeamsFolderActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

/**
 * Sync Workflow for Intercom.
 * This workflow is responsible for syncing all the help centers for a given connector.
 * Lauched on a cron schedule every hour, it will sync all the help centers that are in DB.
 * If a signal is received, it will sync the help centers that were modified.
 */
export async function intercomSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  await saveIntercomConnectorStartSync({ connectorId });

  // Add folder node for teams
  await upsertIntercomTeamsFolderActivity({
    connectorId,
  });

  const uniqueHelpCenterIds = new Set<string>();
  const uniqueTeamIds = new Set<string>();
  const signaledHelpCenters: IntercomUpdateSignal[] = [];
  let hasUpdatedSelectAllConvos = false;

  // If we get a signal, update the workflow state by adding help center ids.
  // We send a signal when permissions are updated by the admin.
  setHandler(
    intercomUpdatesSignal,
    (intercomUpdates: IntercomUpdateSignal[]) => {
      intercomUpdates.forEach((signal) => {
        if (signal.type === "help_center") {
          uniqueHelpCenterIds.add(signal.intercomId);
          signaledHelpCenters.push(signal);
        } else if (signal.type === "team") {
          uniqueTeamIds.add(signal.intercomId);
        } else if (signal.type === "all_conversations") {
          hasUpdatedSelectAllConvos = true;
        }
      });
    }
  );

  const isHourlyExecution =
    uniqueHelpCenterIds.size === 0 &&
    uniqueTeamIds.size === 0 &&
    !hasUpdatedSelectAllConvos;

  // If we got no signal, then we're on the hourly execution
  // We will only refresh the Help Center data as Conversations have webhooks
  if (isHourlyExecution) {
    const helpCenterIds = await getHelpCenterIdsToSyncActivity(connectorId);
    helpCenterIds.forEach((i) => uniqueHelpCenterIds.add(i));
  }

  const {
    workflowId,
    searchAttributes: parentSearchAttributes,
    memo,
  } = workflowInfo();

  const currentSyncMs = new Date().getTime();

  // Async operations allow Temporal's event loop to process signals.
  // If a signal arrives during an async operation, it will update the set before the next iteration.
  while (uniqueHelpCenterIds.size > 0) {
    // Create a copy of the set to iterate over, to avoid issues with concurrent modification.
    const helpCenterIdsToProcess = new Set(uniqueHelpCenterIds);
    for (const helpCenterId of helpCenterIdsToProcess) {
      if (!uniqueHelpCenterIds.has(helpCenterId)) {
        continue;
      }

      const relatedSignal = signaledHelpCenters.find((signaledHelpCenter) => {
        return signaledHelpCenter.intercomId === helpCenterId;
      });

      // Async operation yielding control to the Temporal runtime.
      await executeChild(intercomHelpCenterSyncWorklow, {
        workflowId: `${workflowId}-help-center-${helpCenterId}`,
        searchAttributes: parentSearchAttributes,
        args: [
          {
            connectorId,
            helpCenterId,
            currentSyncMs,
            forceResync: relatedSignal?.forceResync || false,
          },
        ],
        memo,
      });
      // Remove the processed help center from the original set after the async operation.
      uniqueHelpCenterIds.delete(helpCenterId);
    }
  }

  if (isHourlyExecution) {
    // sync all conversations of the last hour for all teams
    const teamIds = await getTeamIdsToSyncActivity({ connectorId });

    for (const teamId of teamIds) {
      await executeChild(intercomHourlyConversationSyncWorkflow, {
        workflowId: `${workflowId}-team-${teamId}`,
        searchAttributes: parentSearchAttributes,
        args: [
          {
            connectorId,
            teamId,
            currentSyncMs,
          },
        ],
      });
    }
  }

  // Async operations allow Temporal's event loop to process signals.
  // If a signal arrives during an async operation, it will update the set before the next iteration.
  while (uniqueTeamIds.size > 0) {
    // Create a copy of the set to iterate over, to avoid issues with concurrent modification.
    const teamIdsToProcess = new Set(uniqueTeamIds);
    for (const teamId of teamIdsToProcess) {
      if (!uniqueTeamIds.has(teamId)) {
        continue;
      }

      // Async operation yielding control to the Temporal runtime.
      await executeChild(intercomTeamFullSyncWorkflow, {
        workflowId: `${workflowId}-team-${teamId}`,
        searchAttributes: parentSearchAttributes,
        args: [
          {
            connectorId,
            teamId,
            currentSyncMs,
          },
        ],
        memo,
      });
      // Remove the processed team from the original set after the async operation.
      uniqueTeamIds.delete(teamId);
    }
  }

  if (hasUpdatedSelectAllConvos) {
    await executeChild(intercomAllConversationsSyncWorkflow, {
      workflowId: `${workflowId}-all-conversations`,
      searchAttributes: parentSearchAttributes,
      args: [
        {
          connectorId,
          currentSyncMs,
        },
      ],
      memo,
    });
  }

  await intercomOldConversationsCleanup({
    connectorId,
  });

  await saveIntercomConnectorSuccessSync({ connectorId });
}

/**
 * Sync Workflow for a Help Center.
 * Launched by the IntercomSyncWorkflow, it will sync a given help center.
 * We sync a HelpCenter by fetching all the Collections and Articles.
 */
export async function intercomHelpCenterSyncWorklow({
  connectorId,
  helpCenterId,
  currentSyncMs,
  forceResync,
}: {
  connectorId: ModelId;
  helpCenterId: string;
  currentSyncMs: number;
  forceResync: boolean;
}) {
  const shouldSyncArticles = await syncHelpCenterOnlyActivity({
    connectorId,
    helpCenterId,
    currentSyncMs,
  });

  if (!shouldSyncArticles) {
    // We don't have permission anymore on this help center, we don't sync it.
    return;
  }

  // First we sync the collections
  const collectionIds = await getLevel1CollectionsIdsActivity({
    connectorId,
    helpCenterId,
  });
  for (const collectionId of collectionIds) {
    await syncLevel1CollectionWithChildrenActivity({
      connectorId,
      helpCenterId,
      collectionId,
      currentSyncMs,
    });
  }

  // Then we sync the articles
  // We loop over the conversations to sync them all, by batch of INTERCOM_CONVO_BATCH_SIZE.
  let page: number | null = 1;
  do {
    const { nextPage } = await syncArticleBatchActivity({
      connectorId,
      helpCenterId,
      page,
      currentSyncMs,
      forceResync,
    });
    page = nextPage;
  } while (page);
}

/**
 * Sync Workflow for a Team.
 * Launched by the IntercomSyncWorkflow, it will sync a given Team.
 * We sync a Team by fetching the conversations attached to this team.
 */
export async function intercomTeamFullSyncWorkflow({
  connectorId,
  teamId,
  currentSyncMs,
}: {
  connectorId: ModelId;
  teamId: string;
  currentSyncMs: number;
}) {
  // Updates the Team name and make sure we're still allowed to sync it.
  // If the team is not allowed anymore (permission to none or object not in Intercom anymore), it will delete all the attached conversations.
  const shouldSyncConversations = await syncTeamOnlyActivity({
    connectorId,
    teamId,
    currentSyncMs,
  });

  if (!shouldSyncConversations) {
    // We don't have permission anymore on this team, we don't sync it.
    return;
  }

  let cursor = null;

  // We loop over the conversations to sync them all, by batch of INTERCOM_CONVO_BATCH_SIZE.
  do {
    const { conversationIds, nextPageCursor } =
      await getNextConversationBatchToSyncActivity({
        connectorId,
        teamId,
        cursor,
      });

    await syncConversationBatchActivity({
      connectorId,
      teamId,
      conversationIds,
      currentSyncMs,
    });

    cursor = nextPageCursor;
  } while (cursor);
}

/**
 * Sync Workflow for a Conversations of the last hour.
 * Launched by the IntercomSyncWorkflow, it will sync a given Conversations of the last hour.
 * We sync a Team by fetching the conversations attached to this team.
 */
export async function intercomHourlyConversationSyncWorkflow({
  connectorId,
  teamId,
  currentSyncMs,
}: {
  connectorId: ModelId;
  teamId: string;
  currentSyncMs: number;
}) {
  let cursor = null;

  // We loop over the conversations to sync them all, by batch of INTERCOM_CONVO_BATCH_SIZE.
  do {
    const { conversationIds, nextPageCursor } =
      await getNextConversationBatchToSyncActivity({
        connectorId,
        teamId,
        cursor,
        lastHourOnly: true,
      });

    await syncConversationBatchActivity({
      connectorId,
      teamId,
      conversationIds,
      currentSyncMs,
    });

    cursor = nextPageCursor;
  } while (cursor);
}

/**
 * Sync Workflow for a All Conversations.
 * Launched by the IntercomSyncWorkflow if a signal is received (meaning the admin updated the permissions and ticked or unticked the "All Conversations" checkbox).
 */
export async function intercomAllConversationsSyncWorkflow({
  connectorId,
  currentSyncMs,
}: {
  connectorId: ModelId;
  currentSyncMs: number;
}) {
  const syncAllConvosStatus = await getSyncAllConversationsStatusActivity({
    connectorId,
  });

  let cursor = null;
  let convosIdsToDelete = [];

  switch (syncAllConvosStatus) {
    case "activated":
    case "disabled":
      // Nothing to do, we're already in the right state.
      break;
    case "scheduled_activate":
      // Upserts teams with permission "none" if not already in db and syncs them with data_sources_folders/nodes.
      await syncAllTeamsActivity({ connectorId, currentSyncMs });
      // We loop over the conversations to sync them all.
      do {
        const { conversationIds, nextPageCursor } =
          await getNextConversationBatchToSyncActivity({
            connectorId,
            cursor,
          });
        await syncConversationBatchActivity({
          connectorId,
          conversationIds,
          currentSyncMs,
        });
        cursor = nextPageCursor;
      } while (cursor);
      // We mark the status as activated.
      await setSyncAllConversationsStatusActivity({
        connectorId,
        status: "activated",
      });
      break;
    case "scheduled_revoke":
      // Delete the teams that are not explicitly allowed in db.
      await deleteRevokedTeamsActivity({ connectorId });
      // We loop over the conversations delete all those that does not belong to a Team in "read".
      do {
        convosIdsToDelete =
          await getNextRevokedConversationsBatchToDeleteActivity({
            connectorId,
          });
        await deleteConversationBatchActivity({
          connectorId,
          conversationIds: convosIdsToDelete,
        });
      } while (convosIdsToDelete.length > 0);
      // We mark the status as disabled.
      await setSyncAllConversationsStatusActivity({
        connectorId,
        status: "disabled",
      });
      break;
  }
}

/**
 * Cleaning Workflow to remove old convos.
 * Launched by the IntercomSyncWorkflow, it will sync a given Team.
 * We sync a Team by fetching the conversations attached to this team.
 */
export async function intercomOldConversationsCleanup({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  let conversationIds = [];
  do {
    conversationIds = await getNextOldConversationsBatchToDeleteActivity({
      connectorId,
    });
    await deleteConversationBatchActivity({
      connectorId,
      conversationIds,
    });
  } while (conversationIds.length > 0);
}
