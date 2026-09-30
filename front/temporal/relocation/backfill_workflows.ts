import type * as destinationActivities from "@app/temporal/relocation/activities/destination_region/core/conversation_backfill";
import type * as sourceActivities from "@app/temporal/relocation/activities/source_region/core/conversation_backfill";
import { RELOCATION_QUEUES_PER_CELL } from "@app/temporal/relocation/config";
import type {
  ConversationBackfillScope,
  ConversationBackfillState,
} from "@app/temporal/relocation/lib/conversation_backfill";
import {
  CONVERSATION_BACKFILL_DEFAULT_CONCURRENCY,
  CONVERSATION_BACKFILL_MAX_CONCURRENCY,
} from "@app/temporal/relocation/lib/conversation_backfill";
import { ApplicationFailure } from "@temporalio/common";
import {
  continueAsNew,
  defineQuery,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

interface ConversationBackfillArgs extends ConversationBackfillScope {
  concurrency?: number;
  state?: ConversationBackfillState;
}

const MAX_HISTORY_LENGTH = 5_000;
export const conversationBackfillProgressQuery =
  defineQuery<ConversationBackfillState | null>("conversationBackfillProgress");

/**
 * @cc [owner:Nils-Fedrigo,label:concurrency] bounded-conversation-backfill
 * The coordinator MUST await completion and destination verification of the whole
 * current group before advancing. Continue-as-new MUST retain its inventory and
 * cursor, including during polling; external per-source executions survive it.
 */
export async function workspaceBackfillConversationDataSourcesWorkflow({
  concurrency = CONVERSATION_BACKFILL_DEFAULT_CONCURRENCY,
  state: initialState,
  ...scope
}: ConversationBackfillArgs): Promise<ConversationBackfillState> {
  if (
    scope.sourceCell === scope.destCell ||
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > CONVERSATION_BACKFILL_MAX_CONCURRENCY
  ) {
    throw ApplicationFailure.nonRetryable(
      "Invalid backfill cells or concurrency."
    );
  }
  const source = proxyActivities<typeof sourceActivities>({
    taskQueue: RELOCATION_QUEUES_PER_CELL[scope.sourceCell],
    startToCloseTimeout: "10 minutes",
    retry: { maximumAttempts: 5 },
  });
  const inventoryActivities = proxyActivities<typeof sourceActivities>({
    taskQueue: RELOCATION_QUEUES_PER_CELL[scope.sourceCell],
    startToCloseTimeout: "30 minutes",
    heartbeatTimeout: "2 minutes",
    retry: { maximumAttempts: 3 },
  });
  const destination = proxyActivities<typeof destinationActivities>({
    taskQueue: RELOCATION_QUEUES_PER_CELL[scope.destCell],
    startToCloseTimeout: "5 minutes",
    retry: { maximumAttempts: 5 },
  });
  let state: ConversationBackfillState | null = initialState ?? null;
  setHandler(conversationBackfillProgressQuery, () => state);
  state ??= {
    inventory:
      await inventoryActivities.prepareConversationBackfillInventory(scope),
    batchIndex: 0,
    offset: 0,
    completed: 0,
  };

  const checkpoint = (currentState: ConversationBackfillState) =>
    continueAsNew<typeof workspaceBackfillConversationDataSourcesWorkflow>({
      ...scope,
      concurrency,
      state: currentState,
    });

  while (state.batchIndex < state.inventory.batchCount) {
    const sources = await source.readConversationBackfillBatch({
      ...scope,
      inventoryId: state.inventory.inventoryId,
      batchIndex: state.batchIndex,
    });
    while (state.offset < sources.length) {
      if (workflowInfo().historyLength > MAX_HISTORY_LENGTH) {
        return checkpoint(state);
      }
      const group = sources.slice(state.offset, state.offset + concurrency);
      let states = await source.inspectConversationBackfillSources({
        ...scope,
        sources: group,
      });
      await destination.verifyConversationBackfillDestination({
        ...scope,
        states,
      });
      await source.startConversationBackfillSources({
        ...scope,
        sources: group,
      });
      for (;;) {
        states = await source.inspectConversationBackfillSources({
          ...scope,
          sources: group,
        });
        if (states.every(({ status }) => status === "COMPLETED")) {
          break;
        }
        if (states.some(({ status }) => status === "NOT_STARTED")) {
          throw ApplicationFailure.nonRetryable(
            "A started backfill execution disappeared."
          );
        }
        if (workflowInfo().historyLength > MAX_HISTORY_LENGTH) {
          return checkpoint(state);
        }
        await sleep("30 seconds");
      }
      await destination.verifyConversationBackfillDestination({
        ...scope,
        states,
      });
      state = {
        ...state,
        offset: state.offset + group.length,
        completed: state.completed + group.length,
      };
    }
    state = { ...state, batchIndex: state.batchIndex + 1, offset: 0 };
  }
  if (state.completed !== state.inventory.sourceCount) {
    throw ApplicationFailure.nonRetryable("Backfill inventory count mismatch.");
  }
  return state;
}
