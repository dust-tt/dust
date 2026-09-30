import { config as cellConfig } from "@app/lib/api/cells/config";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { getBucketInstance } from "@app/lib/file_storage";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import config from "@app/temporal/relocation/activities/config";
import { RELOCATION_QUEUES_PER_CELL } from "@app/temporal/relocation/config";
import type {
  ConversationBackfillInventory,
  ConversationBackfillScope,
  ConversationBackfillSource,
  ConversationBackfillSourceState,
} from "@app/temporal/relocation/lib/conversation_backfill";
import {
  CONVERSATION_BACKFILL_BATCH_SIZE,
  CONVERSATION_BACKFILL_MAX_CONCURRENCY,
  ConversationBackfillBatchSchema,
  ConversationBackfillManifestSchema,
  conversationBackfillSourceWorkflowId,
  sameCoreDataSource,
} from "@app/temporal/relocation/lib/conversation_backfill";
import {
  readFromRelocationStorage,
  writeToRelocationStorage,
} from "@app/temporal/relocation/lib/file_storage/relocation";
import { getTemporalRelocationClient } from "@app/temporal/relocation/temporal";
import { isDevelopment } from "@app/types/shared/env";
import { activityInfo, heartbeat } from "@temporalio/activity";
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowIdReusePolicy,
  WorkflowNotFoundError,
} from "@temporalio/client";
import { ApplicationFailure } from "@temporalio/common";
import assert from "assert";
import { Op } from "sequelize";

const INVENTORY_OPERATION = "conversation_data_source_backfill";

function checkSourceCell(scope: ConversationBackfillScope) {
  if (
    cellConfig.getCurrentCell().name !== scope.sourceCell ||
    scope.sourceCell === scope.destCell ||
    !/^[a-zA-Z0-9]+$/.test(scope.workspaceId)
  ) {
    throw ApplicationFailure.nonRetryable("Invalid backfill scope.");
  }
}

/**
 * @cc [owner:Nils-Fedrigo,label:backend] snapshot-deferred-conversation-sources
 * The inventory MUST contain only validated sources from this workspace's saved
 * manifests. Duplicate IDs MUST agree on the conversation and original Core IDs.
 * Existing manifests MUST NOT be modified or deleted.
 */
export async function prepareConversationBackfillInventory(
  scope: ConversationBackfillScope
): Promise<ConversationBackfillInventory> {
  checkSourceCell(scope);
  const bucket = getBucketInstance(config.getGcsRelocationBucket(), {
    useServiceAccount: isDevelopment(),
  });
  const prefix = `relocations/${scope.workspaceId}/core/skipped_conversation_data_sources/`;
  const { files } = await bucket.getAllFilesByPrefix({ prefix });
  const manifests = files.filter((file) => file.name.endsWith(".json"));
  if (manifests.length === 0 || manifests.length > 10_000) {
    throw ApplicationFailure.nonRetryable(
      "Expected between 1 and 10000 conversation backfill manifests."
    );
  }

  const sources = new Map<number, ConversationBackfillSource>();
  await concurrentExecutor(
    manifests,
    async (file) => {
      const manifest = ConversationBackfillManifestSchema.safeParse(
        await readFromRelocationStorage(file.name)
      );
      if (
        !manifest.success ||
        manifest.data.workspaceId !== scope.workspaceId ||
        manifest.data.sourceCell !== scope.sourceCell
      ) {
        throw ApplicationFailure.nonRetryable(
          `Invalid or out-of-scope backfill manifest: ${file.name}`
        );
      }
      for (const source of manifest.data.dataSources) {
        const previous = sources.get(source.id);
        if (
          previous &&
          (!sameCoreDataSource(previous, source) ||
            previous.conversationId !== source.conversationId)
        ) {
          throw ApplicationFailure.nonRetryable(
            `Conflicting backfill manifests for source ${source.id}.`
          );
        }
        sources.set(source.id, source);
      }
      heartbeat({ manifest: file.name });
    },
    { concurrency: 5 }
  );

  const entries = [...sources.values()].sort((a, b) => a.id - b.id);
  if (entries.length === 0) {
    throw ApplicationFailure.nonRetryable("The backfill inventory is empty.");
  }
  const inventoryId = activityInfo().workflowExecution.runId;
  const batchCount = Math.ceil(
    entries.length / CONVERSATION_BACKFILL_BATCH_SIZE
  );
  for (let index = 0; index < batchCount; index++) {
    const offset = index * CONVERSATION_BACKFILL_BATCH_SIZE;
    await writeToRelocationStorage(
      {
        ...scope,
        dataSources: entries.slice(
          offset,
          offset + CONVERSATION_BACKFILL_BATCH_SIZE
        ),
      },
      {
        workspaceId: scope.workspaceId,
        type: "core",
        operation: INVENTORY_OPERATION,
        fileName: `${inventoryId}/${index}`,
      }
    );
    heartbeat({ batchIndex: index, batchCount });
  }
  return { inventoryId, batchCount, sourceCount: entries.length };
}

export async function readConversationBackfillBatch({
  inventoryId,
  batchIndex,
  ...scope
}: ConversationBackfillScope & {
  inventoryId: string;
  batchIndex: number;
}): Promise<ConversationBackfillSource[]> {
  checkSourceCell(scope);
  if (
    !/^[a-zA-Z0-9-]+$/.test(inventoryId) ||
    !Number.isSafeInteger(batchIndex) ||
    batchIndex < 0
  ) {
    throw ApplicationFailure.nonRetryable("Invalid inventory cursor.");
  }
  const path = `relocations/${scope.workspaceId}/core/${INVENTORY_OPERATION}/${inventoryId}/${batchIndex}.json`;
  const batch = ConversationBackfillBatchSchema.safeParse(
    await readFromRelocationStorage(path)
  );
  if (
    !batch.success ||
    batch.data.workspaceId !== scope.workspaceId ||
    batch.data.sourceCell !== scope.sourceCell ||
    batch.data.destCell !== scope.destCell
  ) {
    throw ApplicationFailure.nonRetryable("Invalid backfill inventory batch.");
  }
  return batch.data.dataSources;
}

async function sourceWorkflowState(
  workspaceId: string,
  source: ConversationBackfillSource
): Promise<ConversationBackfillSourceState> {
  const client = await getTemporalRelocationClient();
  const workflowId = conversationBackfillSourceWorkflowId(
    workspaceId,
    source.id
  );
  try {
    const execution = await client.workflow.getHandle(workflowId).describe();
    const status = execution.status.name;
    if (status !== "RUNNING" && status !== "COMPLETED") {
      throw ApplicationFailure.nonRetryable(
        `Backfill blocked by ${status} execution: ${workflowId}. Recover it before resuming.`
      );
    }
    return { source, status };
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) {
      return { source, status: "NOT_STARTED" };
    }
    throw error;
  }
}

export async function inspectConversationBackfillSources({
  sources,
  ...scope
}: ConversationBackfillScope & {
  sources: ConversationBackfillSource[];
}): Promise<ConversationBackfillSourceState[]> {
  checkSourceCell(scope);
  assert(
    sources.length > 0 &&
      sources.length <= CONVERSATION_BACKFILL_MAX_CONCURRENCY
  );
  const workspace = await getWorkspaceInfos(scope.workspaceId);
  assert(workspace, "Source workspace not found.");
  const rows = await DataSourceModel.findAll({
    where: {
      workspaceId: workspace.id,
      id: { [Op.in]: sources.map((s) => s.id) },
    },
  });
  for (const source of sources) {
    const row = rows.find((candidate) => candidate.id === source.id);
    if (
      !row ||
      row.conversationId !== source.conversationId ||
      !sameCoreDataSource(row, source)
    ) {
      throw ApplicationFailure.nonRetryable(
        `Source ${source.id} is missing, deleted, or differs from its manifest.`
      );
    }
  }
  return concurrentExecutor(
    sources,
    (source) => sourceWorkflowState(scope.workspaceId, source),
    { concurrency: 5 }
  );
}

/**
 * @cc [owner:Nils-Fedrigo,label:concurrency] never-restart-backfill-source
 * A start MUST use the existing per-source workflow ID and REJECT_DUPLICATE.
 * Retry after a lost response MUST attach to the existing execution, never replay
 * a failed or completed non-idempotent relocation. Destination preflight is required.
 */
export async function startConversationBackfillSources({
  sources,
  ...scope
}: ConversationBackfillScope & {
  sources: ConversationBackfillSource[];
}): Promise<void> {
  checkSourceCell(scope);
  const states = await inspectConversationBackfillSources({
    ...scope,
    sources,
  });
  const client = await getTemporalRelocationClient();
  // All histories are inspected before any source in this group is started.
  for (const { source, status } of states) {
    if (status !== "NOT_STARTED") {
      continue;
    }
    const workflowId = conversationBackfillSourceWorkflowId(
      scope.workspaceId,
      source.id
    );
    try {
      await client.workflow.start("workspaceRelocateDataSourceCoreWorkflow", {
        workflowId,
        workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
        taskQueue: RELOCATION_QUEUES_PER_CELL[scope.sourceCell],
        args: [{ ...scope, dataSourceCoreIds: source }],
        memo: { workspaceId: scope.workspaceId, conversationBackfill: true },
      });
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) {
        throw error;
      }
      await sourceWorkflowState(scope.workspaceId, source);
    }
  }
}
