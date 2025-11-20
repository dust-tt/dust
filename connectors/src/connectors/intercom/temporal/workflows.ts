import {
  continueAsNew,
  executeChild,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/intercom/temporal/activities";
import type { IntercomUpdateSignal } from "@connectors/connectors/intercom/temporal/signals";
import type { ModelId } from "@connectors/types";

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

const { syncTeamOnlyActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

const {
  getTeamIdsToSyncActivity,
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

const TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH = 40_000;
const TEMPORAL_WORKFLOW_MAX_HISTORY_SIZE_MB = 40;

// We sync conversations over the last 30 minutes, a bit more than the schedule frequency to allow for some overlap.
const CONVERSATION_SYNC_WINDOW_MINUTES = 30;

/**
 * This workflow is triggered by signals when permissions are updated or when a full sync is triggered.
 * It processes help centers, teams, and "all conversations" based on the signals received.
 */
export async function intercomFullSyncWorkflow({
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
      await executeChild(intercomHelpCenterFullSyncWorkflow, {
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
    await executeChild(intercomAllConversationsFullSyncWorkflow, {
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

  await saveIntercomConnectorSuccessSync({ connectorId });
}

/**
 * This workflow runs on a schedule and syncs the Help Center.
 */
export async function intercomHelpCenterSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  await saveIntercomConnectorStartSync({ connectorId });

  // Add folder node for teams
  await upsertIntercomTeamsFolderActivity({
    connectorId,
  });

  const helpCenterIds = await getHelpCenterIdsToSyncActivity(connectorId);

  const {
    workflowId,
    searchAttributes: parentSearchAttributes,
    memo,
  } = workflowInfo();

  const currentSyncMs = new Date().getTime();

  for (const helpCenterId of helpCenterIds) {
    // We full sync the Help Center, we don't have incremental sync here.
    await executeChild(intercomHelpCenterFullSyncWorkflow, {
      workflowId: `${workflowId}-help-center-${helpCenterId}`,
      searchAttributes: parentSearchAttributes,
      args: [
        {
          connectorId,
          helpCenterId,
          currentSyncMs,
          forceResync: false,
        },
      ],
      memo,
    });
  }

  await saveIntercomConnectorSuccessSync({ connectorId });
}

/**
 * This workflow runs on a schedule and syncs conversations closed over the last CONVERSATION_SYNC_WINDOW_MINUTES.
 */
export async function intercomConversationSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  await saveIntercomConnectorStartSync({ connectorId });

  // Add folder node for teams.
  await upsertIntercomTeamsFolderActivity({
    connectorId,
  });

  const teamIds = await getTeamIdsToSyncActivity({ connectorId });

  const currentSyncMs = new Date().getTime();

  // Sync conversations for each team.
  for (const teamId of teamIds) {
    await syncTeamConversations({
      connectorId,
      teamId,
      currentSyncMs,
    });
  }

  // If we sync all conversations, we need to check for conversations that are not assign to a team.
  const syncAllConvosStatus = await getSyncAllConversationsStatusActivity({
    connectorId,
  });
  if (syncAllConvosStatus === "activated") {
    await syncTeamConversations({
      connectorId,
      teamId: undefined,
      currentSyncMs,
    });
  }

  await cleanupOutdatedConversations({
    connectorId,
  });

  await saveIntercomConnectorSuccessSync({ connectorId });
}

/**
 * This workflow is called as a child workflow, it will sync a given Help Center.
 * We sync a Help Center by fetching all the Collections and Articles.
 */
export async function intercomHelpCenterFullSyncWorkflow({
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
 * This workflow is called as a child workflow of intercomFullSyncWorkflow, it will sync conversations for a team.
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

  await syncTeamConversations({
    connectorId,
    teamId,
    currentSyncMs,
  });
}

/**
 * This workflow is called as a child workflow of intercomFullSyncWorkflow, it will sync conversations for all teams.
 * It is triggered when the admin updated the permissions and ticked or unticked the "All Conversations" checkbox.
 */
export async function intercomAllConversationsFullSyncWorkflow({
  connectorId,
  currentSyncMs,
  initialCursor = null,
}: {
  connectorId: ModelId;
  currentSyncMs: number;
  initialCursor?: string | null;
}) {
  const syncAllConvosStatus = await getSyncAllConversationsStatusActivity({
    connectorId,
  });

  let cursor = initialCursor;
  let convosIdsToDelete = [];

  switch (syncAllConvosStatus) {
    case "activated":
    case "disabled":
      // Nothing to do, we're already in the right state.
      break;
    case "scheduled_activate":
      // Upserts teams with permission "none" if not already in db and syncs them with data_sources_folders/nodes.
      if (!initialCursor) {
        await syncAllTeamsActivity({ connectorId, currentSyncMs });
      }
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

        if (
          cursor &&
          (workflowInfo().historyLength >
            TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH ||
            workflowInfo().historySize >
              TEMPORAL_WORKFLOW_MAX_HISTORY_SIZE_MB * 1024 * 1024)
        ) {
          await continueAsNew<typeof intercomAllConversationsFullSyncWorkflow>({
            connectorId,
            currentSyncMs,
            initialCursor: cursor,
          });
        }
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

async function syncTeamConversations({
  connectorId,
  teamId,
  currentSyncMs,
}: {
  connectorId: ModelId;
  teamId: string | undefined;
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
        closedAfterTimeWindowMinutes: CONVERSATION_SYNC_WINDOW_MINUTES,
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

async function cleanupOutdatedConversations({
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
